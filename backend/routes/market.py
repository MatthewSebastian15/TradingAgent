"""Market data endpoints — lightweight ticker quotes and yfinance symbol search."""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta
from time import monotonic
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Query, Request

from errors import BadRequestError
from rate_limiter import limit_request, request_policy
from schemas import (
    MarketMoversResponse,
    MarketOverviewRequest,
    MarketOverviewResponse,
    MarketPresetsResponse,
    MarketQuotesResponse,
    SymbolValidationResponse,
)
from services.market_symbol_universe import MARKET_SEARCH_UNIVERSE
from services.market_yfinance_service import (
    dedupe_symbols,
    get_market_movers,
    get_market_presets,
    get_overview_data,
    normalize_market_symbol,
    validate_symbol,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Default tickers shown on the dashboard ticker tape.
_DEFAULT_TICKERS: list[str] = [
    "ES=F",
    "NQ=F",
    "^VIX",
    "DX-Y.NYB",
    "^TNX",
    "BTC-USD",
    "CL=F",
    "GC=F",
    "^N225",
    "^JKSE",
]
_QUOTE_SYMBOL_RE = re.compile(r"^[A-Z0-9^]{1,15}(?:[.=:-][A-Z0-9]{1,12}){0,3}$")
_QUOTE_CACHE_TTL_SECONDS = 90.0
_SEARCH_CACHE_TTL_SECONDS = 60.0
_OHLCV_CACHE_TTL_SECONDS = 60.0
_QUOTE_CACHE: dict[tuple[str, ...], tuple[float, list[dict]]] = {}
_SEARCH_CACHE: dict[tuple[str, int], tuple[float, list[dict[str, Any]]]] = {}
_OHLCV_CACHE: dict[tuple[str, str, str], tuple[float, dict[str, Any]]] = {}
_OHLCV_RANGE_DAYS = {"1W": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 365}
_OHLCV_RANGE_OPTIONS = {"YTD", *_OHLCV_RANGE_DAYS.keys()}
_MOVER_LIMITS = {5, 10, 15, 20}


_IDX_AUTO_SUFFIX_SYMBOLS = {
    "AALI",
    "ACES",
    "ADRO",
    "AKRA",
    "AMMN",
    "ANTM",
    "ARTO",
    "ASII",
    "BBCA",
    "BBNI",
    "BBRI",
    "BBTN",
    "BMRI",
    "BRIS",
    "BRPT",
    "CPIN",
    "ESSA",
    "EXCL",
    "GOTO",
    "ICBP",
    "INCO",
    "INDF",
    "INKP",
    "INTP",
    "ISAT",
    "ITMG",
    "KLBF",
    "MDKA",
    "MEDC",
    "PGAS",
    "PTBA",
    "SMGR",
    "TLKM",
    "UNTR",
    "UNVR",
}


def _normalize_quote_symbol(symbol: str) -> str:
    "Normalize symbols used by the global ticker tape without blocking Yahoo index/future syntax."
    normalized = symbol.strip().upper() if isinstance(symbol, str) else symbol
    if (
        isinstance(normalized, str)
        and "." not in normalized
        and normalized in _IDX_AUTO_SUFFIX_SYMBOLS
    ):
        normalized = f"{normalized}.JK"
    if not isinstance(normalized, str) or not _QUOTE_SYMBOL_RE.fullmatch(normalized):
        raise BadRequestError(
            "Invalid ticker symbol.",
            details={
                "fields": {
                    ("ticker"): (
                        "Ticker must be a canonical yfinance quote symbol, for example ES=F, "
                        + "^VIX, DX-Y.NYB, BTC-USD, or AAPL."
                    )
                }
            },
        )
    return normalized


def _normalize_market_request_symbols(symbols: list[str]) -> list[str]:
    if not isinstance(symbols, list):
        raise BadRequestError(
            "Invalid market overview request.",
            details={"fields": {"symbols": "symbols must be an array."}},
        )

    errors: dict[str, str] = {}
    normalized: list[str] = []
    for index, symbol in enumerate(symbols):
        if not isinstance(symbol, str):
            errors[f"symbols[{index}]"] = "symbol must be string."
            continue
        value = normalize_market_symbol(symbol)
        if not value:
            errors[f"symbols[{index}]"] = "symbol must not be empty."
            continue
        if not _QUOTE_SYMBOL_RE.fullmatch(value):
            errors[f"symbols[{index}]"] = "symbol must be a canonical yfinance symbol."
            continue
        normalized.append(value)

    normalized = dedupe_symbols(normalized)
    if len(normalized) < 3:
        errors["symbols"] = "symbols.length must be >= 3."
    if len(normalized) > 6:
        errors["symbols"] = "symbols.length must be <= 6."

    if errors:
        raise BadRequestError("Invalid market overview request.", details={"fields": errors})
    return normalized


def _validate_movers_query(country: str, exchange: str, limit: int) -> tuple[str, str, int]:
    normalized_country = str(country or "").strip()
    normalized_exchange = str(exchange or "").strip()
    errors: dict[str, str] = {}

    if not normalized_country:
        errors["country"] = "country required."
    if not normalized_exchange:
        errors["exchange"] = "exchange required."
    if limit not in _MOVER_LIMITS:
        errors["limit"] = "limit must be one of 5, 10, 15, 20."

    if errors:
        raise BadRequestError("Invalid market movers request.", details={"fields": errors})
    return normalized_country, normalized_exchange, limit


def _clone_quotes(quotes: list[dict]) -> list[dict]:
    return [dict(item) for item in quotes]


def _clone_search_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in results]


def _clone_ohlcv_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "points": [dict(item) for item in payload.get("points") or []],
        "data": [dict(item) for item in payload.get("data") or []],
    }


@router.get("/market/presets", tags=["market"], response_model=MarketPresetsResponse)
async def get_market_preset_data(request: Request) -> dict[str, Any]:
    async with limit_request(request, request_policy()):
        return get_market_presets()


@router.get("/market/validate-symbol", tags=["market"], response_model=SymbolValidationResponse)
async def validate_market_symbol(
    request: Request,
    symbol: str = Query(..., min_length=1, description="Yahoo Finance symbol."),
) -> dict[str, Any]:
    async with limit_request(request, request_policy()):
        normalized_symbol = _normalize_quote_symbol(symbol)
        return await asyncio.to_thread(validate_symbol, normalized_symbol)


@router.post("/market/overview", tags=["market"], response_model=MarketOverviewResponse)
async def get_market_overview(
    payload: MarketOverviewRequest,
    request: Request,
) -> dict[str, Any]:
    normalized_symbols = _normalize_market_request_symbols(payload.symbols)
    async with limit_request(request, request_policy()):
        return await asyncio.to_thread(get_overview_data, normalized_symbols)


@router.get("/market/movers", tags=["market"], response_model=MarketMoversResponse)
async def get_market_mover_data(
    request: Request,
    country: str = Query(..., min_length=1),
    exchange: str = Query(..., min_length=1),
    limit: int = Query(default=5),
) -> dict[str, Any]:
    normalized_country, normalized_exchange, normalized_limit = _validate_movers_query(
        country, exchange, limit
    )
    async with limit_request(request, request_policy()):
        return await asyncio.to_thread(
            get_market_movers, normalized_country, normalized_exchange, normalized_limit
        )


def _as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _parse_ohlcv_trade_date(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d")
    except ValueError as exc:
        raise BadRequestError(
            "Invalid trade date.",
            details={"fields": {"trade_date": "Trade date must use YYYY-MM-DD format."}},
        ) from exc


def _ohlcv_start_date(end_dt: datetime, range_key: str) -> datetime:
    if range_key == "YTD":
        return datetime(end_dt.year, 1, 1)
    return end_dt - timedelta(days=_OHLCV_RANGE_DAYS[range_key])


def _ohlcv_intervals(range_key: str) -> list[str]:
    if range_key == "1W":
        return ["5m", "15m", "30m", "60m", "1d"]
    if range_key == "1M":
        return ["60m", "1d"]
    return ["1d"]


def _download_ohlcv(symbol: str, start_dt: datetime, end_dt: datetime, interval: str) -> Any:
    from tradingagents.yfinance_runtime import yf  # noqa: PLC0415

    start = start_dt.strftime("%Y-%m-%d")
    end = (end_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    data = yf.download(
        symbol,
        start=start,
        end=end,
        interval=interval,
        multi_level_index=False,
        progress=False,
        auto_adjust=False,
        threads=False,
    )
    if data is None or getattr(data, "empty", True):
        data = yf.Ticker(symbol).history(start=start, end=end, interval=interval, auto_adjust=False)
    return data


def _normalize_ohlcv_rows(
    data: Any, start_dt: datetime, end_dt: datetime, interval: str
) -> list[dict[str, Any]]:
    import pandas as pd  # noqa: PLC0415

    if data is None or getattr(data, "empty", True):
        return []

    frame = data.copy()
    if isinstance(frame.columns, pd.MultiIndex):
        frame.columns = [str(col[0] if col[0] else col[-1]) for col in frame.columns]
    frame = frame.sort_index()
    frame = frame[~frame.index.duplicated(keep="last")]
    if getattr(frame.index, "tz", None) is not None:
        frame.index = frame.index.tz_localize(None)
    frame.index = pd.to_datetime(frame.index, errors="coerce")
    frame = frame[frame.index.notna()]

    columns = {str(column).strip().lower(): column for column in frame.columns}
    open_col = columns.get("open")
    high_col = columns.get("high")
    low_col = columns.get("low")
    close_col = columns.get("close")
    adjusted_col = columns.get("adj close") or columns.get("adjusted close")
    volume_col = columns.get("volume")
    if not all([open_col, high_col, low_col, close_col]):
        return []

    points: list[dict[str, Any]] = []
    start_date = start_dt.date()
    end_date = end_dt.date()
    for index, row in frame.iterrows():
        row_date = index.date()
        if row_date < start_date or row_date > end_date:
            continue

        open_price = _as_float(row.get(open_col))
        high_price = _as_float(row.get(high_col))
        low_price = _as_float(row.get(low_col))
        close_price = _as_float(row.get(close_col))
        if any(value is None for value in (open_price, high_price, low_price, close_price)):
            continue

        has_time = interval != "1d" and any((index.hour, index.minute, index.second))
        date_text = index.strftime("%Y-%m-%d %H:%M") if has_time else index.strftime("%Y-%m-%d")
        volume_value = _as_float(row.get(volume_col)) if volume_col else None
        adjusted_close = _as_float(row.get(adjusted_col)) if adjusted_col else close_price
        points.append(
            {
                "date": date_text,
                "open": open_price,
                "high": max(high_price, open_price, close_price, low_price),
                "low": min(low_price, open_price, close_price, high_price),
                "close": close_price,
                "adjusted_close": adjusted_close if adjusted_close is not None else close_price,
                "volume": int(volume_value)
                if volume_value is not None and volume_value >= 0
                else None,
            }
        )
    return points


def _fetch_ohlcv_range(symbol: str, range_key: str, trade_date: str | None) -> dict[str, Any]:
    end_dt = _parse_ohlcv_trade_date(trade_date)
    start_dt = _ohlcv_start_date(end_dt, range_key)
    intervals = _ohlcv_intervals(range_key)
    last_error: Exception | None = None

    for interval in intervals:
        try:
            rows = _normalize_ohlcv_rows(
                _download_ohlcv(symbol, start_dt, end_dt, interval), start_dt, end_dt, interval
            )
            if not rows:
                continue
            if len(rows) < 2 and interval != intervals[-1]:
                continue
            return {
                "available": len(rows) >= 2,
                "source": f"yfinance:{interval}",
                "ticker": symbol,
                "range": range_key,
                "interval": interval,
                "fallback_to_daily": interval == "1d" and intervals[0] != "1d",
                "requested_trade_date": end_dt.strftime("%Y-%m-%d"),
                "start_date": start_dt.strftime("%Y-%m-%d"),
                "end_date": end_dt.strftime("%Y-%m-%d"),
                "last_trade_date": str(rows[-1]["date"])[:10],
                "points": rows,
                "data": rows,
                "data_quality": {
                    "status": "complete" if len(rows) >= 2 else "partial",
                    "missing_fields": [],
                    "point_count": len(rows),
                },
                "warning": None
                if len(rows) >= 2
                else "Only one OHLCV candle was available for this range.",
            }
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.debug("OHLCV fetch failed for %s %s %s: %s", symbol, range_key, interval, exc)

    warning = str(last_error or "No OHLCV candles returned for the selected range.")
    return {
        "available": False,
        "source": "yfinance",
        "ticker": symbol,
        "range": range_key,
        "interval": None,
        "fallback_to_daily": intervals[-1] == "1d" and intervals[0] != "1d",
        "requested_trade_date": end_dt.strftime("%Y-%m-%d"),
        "start_date": start_dt.strftime("%Y-%m-%d"),
        "end_date": end_dt.strftime("%Y-%m-%d"),
        "last_trade_date": None,
        "points": [],
        "data": [],
        "data_quality": {"status": "unavailable", "missing_fields": ["ohlcv"], "point_count": 0},
        "warning": warning,
    }


def _fast_info_value(info: Any, *names: str) -> Any:
    for name in names:
        if isinstance(info, dict) and name in info:
            return info.get(name)
        value = getattr(info, name, None)
        if value is not None:
            return value
    return None


def _fetch_quote(symbol: str) -> dict:
    """Return a minimal quote dict for *symbol* using yfinance fast_info."""
    try:
        from tradingagents.yfinance_runtime import yf  # noqa: PLC0415

        ticker = yf.Ticker(symbol)
        info = ticker.fast_info

        # fast_info attributes vary by symbol/exchange; fall back gracefully.
        previous_close = _fast_info_value(info, "previous_close", "regularMarketPreviousClose")
        last_price = _fast_info_value(info, "last_price", "regularMarketPrice")

        if previous_close and last_price and previous_close != 0:
            raw_chg = (last_price - previous_close) / previous_close * 100
            sign = "+" if raw_chg >= 0 else ""
            chg_str = f"{sign}{raw_chg:.2f}%"
            pos = raw_chg >= 0
        else:
            chg_str = "N/A"
            pos = True

        return {
            "sym": symbol,
            "chg": chg_str,
            "pos": pos,
            "price": round(last_price, 2) if last_price else None,
            "error": False,
        }

    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch quote for %s: %s", symbol, exc)
        return {"sym": symbol, "chg": "N/A", "pos": True, "price": None, "error": True}


async def _fetch_quotes(symbols: list[str]) -> list[dict]:
    """Fetch quotes without blocking the FastAPI event loop."""
    if not symbols:
        return []
    tasks = [asyncio.to_thread(_fetch_quote, symbol) for symbol in symbols]
    return await asyncio.gather(*tasks)


def _compact_search_text(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").strip().upper())


def _local_search_score(item: dict[str, Any], query: str, compact_query: str) -> int | None:
    symbol = str(item.get("symbol") or "").strip().upper()
    compact_symbol = _compact_search_text(symbol)
    haystack = " ".join(
        str(item.get(key) or "").strip().upper()
        for key in ("symbol", "name", "exchange", "type", "market")
    )
    compact_haystack = _compact_search_text(haystack)
    tokens = [_compact_search_text(part) for part in re.split(r"[^A-Z0-9^._=-]+", haystack)]

    if symbol == query or compact_symbol == compact_query:
        return 0
    if symbol.startswith(query):
        return 1
    if compact_symbol.startswith(compact_query):
        return 2
    if any(token.startswith(compact_query) for token in tokens if token):
        return 3
    if haystack.startswith(query):
        return 4
    if query in haystack:
        return 8
    if compact_query in compact_haystack:
        return 9
    return None


def _search_local_tickers(query: str, limit: int) -> list[dict[str, Any]]:
    normalized_query = str(query or "").strip().upper()
    compact_query = _compact_search_text(normalized_query)
    if not compact_query:
        return []

    scored: list[tuple[int, int, dict[str, Any]]] = []
    for index, item in enumerate(MARKET_SEARCH_UNIVERSE):
        score = _local_search_score(item, normalized_query, compact_query)
        if score is None:
            continue
        scored.append((score, index, item))

    results = [
        {**item, "symbol": str(item["symbol"]).upper(), "source": "local_universe", "price": None}
        for score, index, item in sorted(scored, key=lambda value: (value[0], value[1]))[:limit]
    ]
    if results or len(compact_query) < 2 or not _QUOTE_SYMBOL_RE.fullmatch(normalized_query):
        return results

    return [
        {
            "symbol": normalized_query,
            "name": normalized_query,
            "exchange": "",
            "type": "SYMBOL",
            "market": "ID" if normalized_query.endswith(".JK") else "US",
            "source": "manual_symbol",
            "price": None,
        }
    ]


def _merge_search_results(*groups: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in [item for group in groups for item in group]:
        symbol = str(item.get("symbol") or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        merged.append({**item, "symbol": symbol})
        if len(merged) >= limit:
            break
    return merged


def _search_instance(yf: Any, query: str, limit: int) -> Any:
    try:
        return yf.Search(
            query=query,
            max_results=limit,
            news_count=0,
            enable_fuzzy_query=True,
        )
    except TypeError:
        try:
            return yf.Search(query, max_results=limit, news_count=0, enable_fuzzy_query=True)
        except TypeError:
            return yf.Search(query)


def _extract_search_quotes(search: Any) -> list[dict[str, Any]]:
    quotes = getattr(search, "quotes", None)
    if isinstance(quotes, list):
        return [item for item in quotes if isinstance(item, dict)]

    all_results = getattr(search, "all", None)
    if callable(all_results):
        all_results = all_results()
    if isinstance(all_results, dict):
        candidates = all_results.get("quotes") or all_results.get("quotesResult") or []
        if isinstance(candidates, dict):
            candidates = candidates.get("result") or []
        if isinstance(candidates, list):
            return [item for item in candidates if isinstance(item, dict)]

    return []


def _fetch_last_price(yf: Any, symbol: str) -> float | None:
    try:
        info = yf.Ticker(symbol).fast_info
        value = _fast_info_value(
            info,
            "last_price",
            "regularMarketPrice",
            "lastPrice",
            "previous_close",
            "regularMarketPreviousClose",
        )
        number_value = float(value) if value is not None else None
        return round(number_value, 2) if number_value is not None else None
    except Exception as exc:  # noqa: BLE001
        logger.debug("Failed to fetch search price for %s: %s", symbol, exc)
        return None


def _clean_search_result(raw: dict[str, Any]) -> dict[str, Any] | None:
    symbol = str(raw.get("symbol") or "").strip().upper()
    if not symbol:
        return None

    name = (
        raw.get("shortname")
        or raw.get("longname")
        or raw.get("name")
        or raw.get("displayName")
        or symbol
    )
    exchange = raw.get("exchDisp") or raw.get("exchange") or raw.get("fullExchangeName") or ""
    quote_type = raw.get("quoteType") or raw.get("typeDisp") or raw.get("type") or ""
    raw_price = raw.get("regularMarketPrice") or raw.get("price")
    price = _as_float(raw_price)

    return {
        "symbol": symbol,
        "name": str(name).strip(),
        "exchange": str(exchange).strip().upper(),
        "type": str(quote_type).strip().upper(),
        "price": round(price, 2) if price is not None else None,
        "source": "yfinance_search",
    }


def _search_tickers(query: str, limit: int) -> list[dict[str, Any]]:
    try:
        from tradingagents.yfinance_runtime import yf  # noqa: PLC0415

        search = _search_instance(yf, query, limit)
        raw_quotes = _extract_search_quotes(search)
        results: list[dict[str, Any]] = []
        seen: set[str] = set()

        for raw in raw_quotes:
            item = _clean_search_result(raw)
            if not item or item["symbol"] in seen:
                continue
            seen.add(item["symbol"])
            results.append(item)
            if len(results) >= limit:
                break

        return results
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to search yfinance tickers for %r: %s", query, exc)
        return []


def _refresh_search_cache(query: str, limit: int, local_results: list[dict[str, Any]]) -> None:
    remote_results = _search_tickers(query, limit)
    results = _merge_search_results(local_results, remote_results, limit=limit)
    _SEARCH_CACHE[(query.lower(), limit)] = (monotonic(), _clone_search_results(results))


@router.get("/market/search", tags=["market"])
async def search_market_tickers(
    background_tasks: BackgroundTasks,
    request: Request,
    q: str = Query(..., min_length=2, description="Ticker or company search query."),
    limit: int = Query(default=10, ge=1, le=20, description="Maximum number of search results."),
) -> dict[str, list[dict[str, Any]]]:
    """Search yfinance tickers and return canonical symbols for the frontend autocomplete."""
    async with limit_request(request, request_policy()):
        query = q.strip()
        if len(query) < 2:
            return {"results": []}

        cache_key = (query.lower(), limit)
        now = monotonic()
        local_results = _search_local_tickers(query, limit)
        if len(local_results) >= limit:
            return {"results": local_results[:limit]}

        cached = _SEARCH_CACHE.get(cache_key)
        if cached is not None:
            cached_at, cached_results = cached
            if now - cached_at <= _SEARCH_CACHE_TTL_SECONDS:
                return {
                    "results": _merge_search_results(
                        local_results, _clone_search_results(cached_results), limit=limit
                    )
                }

        background_tasks.add_task(
            _refresh_search_cache, query, limit, _clone_search_results(local_results)
        )
        results = local_results[:limit]

    return {"results": results}


@router.get("/market/ohlcv", tags=["market"])
async def get_market_ohlcv(
    request: Request,
    ticker: str = Query(..., min_length=1, description="Ticker symbol."),
    range_key: str = Query(
        default="1Y", alias="range", description="One of YTD, 1Y, 6M, 3M, 1M, 1W."
    ),
    trade_date: str | None = Query(default=None, description="Optional YYYY-MM-DD upper bound."),
) -> dict[str, Any]:
    async with limit_request(request, request_policy()):
        symbol = _normalize_quote_symbol(ticker)
        normalized_range = str(range_key or "").strip().upper()
        if normalized_range not in _OHLCV_RANGE_OPTIONS:
            raise BadRequestError(
                "Invalid chart range.",
                details={"fields": {"range": "Range must be one of YTD, 1Y, 6M, 3M, 1M, 1W."}},
            )
        parsed_trade_date = _parse_ohlcv_trade_date(trade_date).strftime("%Y-%m-%d")
        cache_key = (symbol, normalized_range, parsed_trade_date)
        cached_at, cached_payload = _OHLCV_CACHE.get(cache_key, (0.0, {}))
        now = monotonic()
        if cached_payload and now - cached_at <= _OHLCV_CACHE_TTL_SECONDS:
            return _clone_ohlcv_payload(cached_payload)

        payload = await asyncio.to_thread(
            _fetch_ohlcv_range, symbol, normalized_range, parsed_trade_date
        )
        _OHLCV_CACHE[cache_key] = (now, _clone_ohlcv_payload(payload))

    return payload


@router.get("/market/quotes", tags=["market"], response_model=MarketQuotesResponse)
async def get_market_quotes(
    request: Request,
    symbols: str = Query(
        default=",".join(_DEFAULT_TICKERS),
        description="Comma-separated list of yfinance symbols, e.g. ES=F,^VIX,BTC-USD",
    ),
) -> dict:
    """Return latest price-change data for a list of ticker symbols.

    Fetches data from yfinance using ``fast_info`` (single HTTP call per
    symbol, no historical download).  Results are returned even when some
    symbols fail — failed tickers include ``\"error\": true`` and ``\"chg\": \"N/A\"``.
    """
    async with limit_request(request, request_policy()):
        raw_symbols = [s.strip() for s in symbols.split(",") if s.strip()]

        # Cap at 20 to avoid overloading yfinance on a single request.
        capped = [_normalize_quote_symbol(sym) for sym in raw_symbols[:20]]

        cache_key = tuple(capped)
        cached_at, cached_quotes = _QUOTE_CACHE.get(cache_key, (0.0, []))
        now = monotonic()
        if cached_quotes and now - cached_at <= _QUOTE_CACHE_TTL_SECONDS:
            return {"quotes": _clone_quotes(cached_quotes)}

        quotes = await _fetch_quotes(capped)
        _QUOTE_CACHE[cache_key] = (now, _clone_quotes(quotes))

    return {"quotes": quotes}
