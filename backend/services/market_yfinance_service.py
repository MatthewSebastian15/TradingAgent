from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any

import pandas as pd

from services.market_cache import market_cache
from services.market_symbol_universe import (
    MARKET_EXCHANGE_PRESETS,
    MARKET_LABELS,
    MARKET_PRESETS,
    get_symbol_universe,
    normalize_country,
)

OVERVIEW_TTL_SECONDS = 120
MOVERS_TTL_SECONDS = 180
VALIDATION_TTL_SECONDS = 3600
YFINANCE_WORKERS = 8


def normalize_market_symbol(symbol: str) -> str:
    return str(symbol or "").strip().upper()


def dedupe_symbols(symbols: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized_symbols: list[str] = []
    for symbol in symbols:
        normalized = normalize_market_symbol(symbol)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        normalized_symbols.append(normalized)
    return normalized_symbols


def get_market_presets() -> dict[str, Any]:
    return {"categories": MARKET_PRESETS, "exchanges": MARKET_EXCHANGE_PRESETS}


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _finite_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _series_values(frame: Any, column_name: str) -> list[float]:
    if frame is None or getattr(frame, "empty", True) or column_name not in frame:
        return []
    values: list[float] = []
    for value in frame[column_name].dropna().tolist():
        number = _finite_float(value)
        if number is not None:
            values.append(number)
    return values


def _fast_info_value(info: Any, *names: str) -> Any:
    for name in names:
        if isinstance(info, dict) and name in info:
            return info.get(name)
        value = getattr(info, name, None)
        if value is not None:
            return value
    return None


def _ticker_name(ticker: Any, symbol: str) -> str:
    try:
        info = getattr(ticker, "fast_info", None)
        value = _fast_info_value(info, "shortName", "longName")
        if value:
            return str(value)
    except Exception:
        pass
    return MARKET_LABELS.get(symbol, symbol)


def _ticker_currency(ticker: Any) -> str | None:
    try:
        info = getattr(ticker, "fast_info", None)
        value = _fast_info_value(info, "currency")
        return str(value).upper() if value else None
    except Exception:
        return None


def _history_for_symbol(symbol: str, *, period: str, interval: str) -> Any:
    from tradingagents.yfinance_runtime import yf

    return yf.Ticker(symbol).history(period=period, interval=interval)


def _download_history(symbols: list[str], *, period: str, interval: str) -> dict[str, Any]:
    from tradingagents.yfinance_runtime import yf

    data = yf.download(
        tickers=symbols,
        period=period,
        interval=interval,
        group_by="ticker",
        auto_adjust=False,
        threads=True,
        progress=False,
    )
    return _normalize_download_frame(data, symbols)


def _overview_item_from_history(symbol: str, history: Any) -> dict[str, Any]:
    try:
        close_values = _series_values(history, "Close")
        if len(close_values) < 2:
            return {
                "symbol": symbol,
                "label": MARKET_LABELS.get(symbol, symbol),
                "status": "error",
                "reason": "No yfinance data found",
            }

        previous_close = close_values[-2]
        last_close = close_values[-1]
        if previous_close == 0:
            return {
                "symbol": symbol,
                "label": MARKET_LABELS.get(symbol, symbol),
                "status": "error",
                "reason": "Previous close unavailable",
            }

        change = last_close - previous_close
        return {
            "symbol": symbol,
            "label": MARKET_LABELS.get(symbol, symbol),
            "last": last_close,
            "change": change,
            "change_percent": (change / previous_close) * 100,
            "sparkline": close_values,
            "status": "ok",
            "updated_at": _now_iso(),
        }
    except Exception as exc:
        return {
            "symbol": symbol,
            "label": MARKET_LABELS.get(symbol, symbol),
            "status": "error",
            "reason": str(exc) or "No yfinance data found",
        }


def _build_overview_item(symbol: str) -> dict[str, Any]:
    try:
        return _overview_item_from_history(
            symbol, _history_for_symbol(symbol, period="1mo", interval="1d")
        )
    except Exception as exc:
        return {
            "symbol": symbol,
            "label": MARKET_LABELS.get(symbol, symbol),
            "status": "error",
            "reason": str(exc) or "No yfinance data found",
        }


def _build_overview_items(symbols: list[str]) -> list[dict[str, Any]]:
    if not symbols:
        return []

    try:
        frames = _download_history(symbols, period="1mo", interval="1d")
    except Exception:
        frames = {}

    items: list[dict[str, Any]] = []
    missing_symbols: list[str] = []
    for symbol in symbols:
        history = frames.get(symbol)
        if history is None or getattr(history, "empty", True):
            missing_symbols.append(symbol)
            continue
        items.append(_overview_item_from_history(symbol, history))

    if not missing_symbols:
        return items

    fallback_items: dict[str, dict[str, Any]] = {}
    max_workers = min(YFINANCE_WORKERS, len(missing_symbols))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_build_overview_item, symbol): symbol for symbol in missing_symbols
        }
        for future in as_completed(futures):
            fallback_items[futures[future]] = future.result()

    by_symbol = {item["symbol"]: item for item in items}
    by_symbol.update(fallback_items)
    return [by_symbol.get(symbol) or _build_overview_item(symbol) for symbol in symbols]


def _overview_cache_metadata(*, hit: bool, force_refresh: bool) -> dict[str, Any]:
    return {
        "hit": hit,
        "ttl_seconds": OVERVIEW_TTL_SECONDS,
        "force_refresh": force_refresh,
    }


def _with_overview_cache_metadata(
    payload: dict[str, Any], *, hit: bool, force_refresh: bool
) -> dict[str, Any]:
    return {
        **payload,
        "source": payload.get("source") or "yfinance",
        "last_updated": payload.get("last_updated") or _now_iso(),
        "cache": _overview_cache_metadata(hit=hit, force_refresh=force_refresh),
    }


def get_overview_data(
    symbols: list[str], *, force_refresh: bool = False
) -> dict[str, Any]:
    normalized_symbols = dedupe_symbols(symbols)
    symbols_hash = sha256("|".join(normalized_symbols).encode("utf-8")).hexdigest()[:16]
    cache_key = f"market:overview:{symbols_hash}"
    cached = market_cache.get(cache_key)
    if cached is not None and not force_refresh:
        return _with_overview_cache_metadata(
            cached, hit=True, force_refresh=False
        )

    items = _build_overview_items(normalized_symbols)
    ok_items = [item for item in items if item.get("status") == "ok"]
    payload: dict[str, Any] = {
        "items": items,
        "source": "yfinance",
        "last_updated": _now_iso(),
    }
    if not ok_items:
        payload["message"] = "No market data available from yfinance"

    cached_payload = market_cache.set(cache_key, payload, OVERVIEW_TTL_SECONDS)
    return _with_overview_cache_metadata(
        cached_payload, hit=False, force_refresh=force_refresh
    )


def validate_symbol(symbol: str) -> dict[str, Any]:
    normalized = normalize_market_symbol(symbol)
    cache_key = f"market:validate:{normalized}"
    cached = market_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        history = _history_for_symbol(normalized, period="5d", interval="1d")
        closes = _series_values(history, "Close")
        if not closes:
            payload = {"symbol": normalized, "valid": False, "reason": "No yfinance data found"}
        else:
            from tradingagents.yfinance_runtime import yf

            ticker = yf.Ticker(normalized)
            payload = {
                "symbol": normalized,
                "valid": True,
                "label": _ticker_name(ticker, normalized),
                "source": "yfinance",
            }
    except Exception:
        payload = {"symbol": normalized, "valid": False, "reason": "No yfinance data found"}

    return market_cache.set(cache_key, payload, VALIDATION_TTL_SECONDS)


def _normalize_download_frame(data: Any, symbols: list[str]) -> dict[str, Any]:
    if data is None or getattr(data, "empty", True):
        return {}
    if isinstance(data.columns, pd.MultiIndex):
        by_symbol: dict[str, Any] = {}
        for symbol in symbols:
            if symbol in data.columns.get_level_values(0):
                by_symbol[symbol] = data[symbol]
        return by_symbol
    return {symbols[0]: data} if len(symbols) == 1 else {}


def _mover_from_history(
    symbol: str, history: Any, *, require_volume: bool
) -> dict[str, Any] | None:
    if history is None or getattr(history, "empty", True):
        return None
    close_values = _series_values(history, "Close")
    if len(close_values) < 2:
        return None

    last = close_values[-1]
    previous = close_values[-2]
    if previous == 0:
        return None

    volume_values = _series_values(history, "Volume")
    volume = int(volume_values[-1]) if volume_values else None
    if require_volume and volume is None:
        return None

    change = last - previous
    return {
        "symbol": symbol,
        "name": MARKET_LABELS.get(symbol, symbol),
        "last": last,
        "change": change,
        "change_percent": (change / previous) * 100,
        "volume": volume,
        "trend": close_values,
    }


def _download_movers(symbols: list[str]) -> dict[str, Any]:
    from tradingagents.yfinance_runtime import yf

    data = yf.download(
        tickers=symbols,
        period="5d",
        interval="1d",
        group_by="ticker",
        auto_adjust=False,
        threads=True,
        progress=False,
    )
    return _normalize_download_frame(data, symbols)


def _download_symbol(symbol: str) -> Any:
    from tradingagents.yfinance_runtime import yf

    return yf.download(
        tickers=symbol,
        period="5d",
        interval="1d",
        group_by="ticker",
        auto_adjust=False,
        threads=False,
        progress=False,
    )


def get_market_movers(country: str, exchange: str, limit: int) -> dict[str, Any]:
    normalized_country = normalize_country(country)
    normalized_exchange = str(exchange or "").strip()
    normalized_limit = int(limit)
    cache_key = (
        f"market:movers:{normalized_country}:{normalized_exchange.upper()}:{normalized_limit}"
    )
    cached = market_cache.get(cache_key)
    if cached is not None:
        return cached

    symbols = get_symbol_universe(normalized_country, normalized_exchange)
    require_volume = True
    frames: dict[str, Any] = {}

    try:
        frames = _download_movers(symbols)
    except Exception:
        frames = {}

    missing_symbols = [symbol for symbol in symbols if frames.get(symbol) is None]
    if missing_symbols:
        max_workers = min(YFINANCE_WORKERS, len(missing_symbols))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_download_symbol, symbol): symbol for symbol in missing_symbols
            }
            for future in as_completed(futures):
                try:
                    frames[futures[future]] = future.result()
                except Exception:
                    frames[futures[future]] = None

    items: list[dict[str, Any]] = []
    for symbol in symbols:
        item = _mover_from_history(symbol, frames.get(symbol), require_volume=require_volume)
        if item is not None:
            items.append(item)

    gainers = sorted(items, key=lambda item: item["change_percent"], reverse=True)[
        :normalized_limit
    ]
    losers = sorted(items, key=lambda item: item["change_percent"])[:normalized_limit]
    payload = {
        "country": normalized_country,
        "exchange": normalized_exchange,
        "limit": normalized_limit,
        "updated_at": _now_iso(),
        "gainers": gainers,
        "losers": losers,
        "source": "yfinance",
    }
    if not gainers and not losers:
        payload["message"] = "No valid market movers found for selected country/exchange."
    return market_cache.set(cache_key, payload, MOVERS_TTL_SECONDS)
