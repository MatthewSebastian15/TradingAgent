from __future__ import annotations

from datetime import datetime
from io import StringIO
from typing import Any

import pandas as pd

from .finnhub_common import (
    FinnhubUnavailableError,
    build_metadata,
    handle_finnhub_error,
    make_api_request,
    to_unix_timestamp,
    unix_to_iso_date,
)


def _try_symbols(symbol: str) -> list[str]:
    cleaned = str(symbol or "").strip().upper()
    if not cleaned:
        return []
    candidates = [cleaned]
    if cleaned.endswith(".JK"):
        candidates.append(cleaned.replace(".JK", ""))
    elif "." not in cleaned and len(cleaned) == 4:
        candidates.append(f"{cleaned}.JK")
    return list(dict.fromkeys(candidates))


def _as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def normalize_quote(symbol: str, payload: dict[str, Any], *, endpoint: str = "/quote") -> dict[str, Any]:
    current = _as_float(payload.get("c"))
    previous_close = _as_float(payload.get("pc"))
    missing = []
    if current is None or current <= 0:
        missing.append("current_price")
    if previous_close is None or previous_close <= 0:
        missing.append("previous_close")

    confidence = "high"
    if missing == ["previous_close"]:
        confidence = "medium"
    elif missing:
        confidence = "unavailable"

    return {
        "symbol": symbol,
        "asset_type": "stock",
        "source": "finnhub",
        "current_price": current,
        "previous_close": previous_close,
        "open": _as_float(payload.get("o")),
        "high": _as_float(payload.get("h")),
        "low": _as_float(payload.get("l")),
        "change": _as_float(payload.get("d")),
        "percent_change": _as_float(payload.get("dp")),
        "timestamp": payload.get("t"),
        "currency": None,
        "metadata": build_metadata(endpoint, is_fallback=True, confidence=confidence, missing_fields=missing),
    }


def get_quote(symbol: str) -> dict[str, Any]:
    """Return a normalized Finnhub quote object."""
    last_error: Exception | None = None
    for candidate in _try_symbols(symbol):
        try:
            payload = make_api_request("/quote", {"symbol": candidate}, feature_key="enable_stock_data")
            if not isinstance(payload, dict):
                raise FinnhubUnavailableError("Quote response is not an object.")
            quote = normalize_quote(candidate, payload)
            current_price = quote.get("current_price")
            if current_price is None or float(current_price) <= 0:
                raise FinnhubUnavailableError("Quote current price is missing or zero.")
            return quote
        except Exception as exc:  # try alternate symbol formats before returning unavailable
            last_error = exc
            continue
    raise FinnhubUnavailableError(str(last_error or "No valid Finnhub quote candidate returned data."))


def _normalize_candles(symbol: str, payload: dict[str, Any], *, start_date: str, end_date: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise FinnhubUnavailableError("Candle response is not an object.")
    if payload.get("s") != "ok":
        raise FinnhubUnavailableError(f"Candle status is {payload.get('s') or 'missing'}.")

    timestamps = payload.get("t") or []
    opens = payload.get("o") or []
    highs = payload.get("h") or []
    lows = payload.get("l") or []
    closes = payload.get("c") or []
    volumes = payload.get("v") or []
    row_count = min(len(timestamps), len(opens), len(highs), len(lows), len(closes), len(volumes))
    if row_count <= 0:
        raise FinnhubUnavailableError("Candle response has no rows.")

    rows: list[dict[str, Any]] = []
    for index in range(row_count):
        close = _as_float(closes[index])
        if close is None or close <= 0:
            continue
        rows.append(
            {
                "Date": unix_to_iso_date(timestamps[index]),
                "Open": _as_float(opens[index]),
                "High": _as_float(highs[index]),
                "Low": _as_float(lows[index]),
                "Close": close,
                "Volume": int(_as_float(volumes[index]) or 0),
            }
        )
    rows = [row for row in rows if row.get("Date")]
    if not rows:
        raise FinnhubUnavailableError(f"No valid candle rows for {symbol} between {start_date} and {end_date}.")
    return rows


def get_stock(symbol: str, start_date: str, end_date: str) -> str:
    """Return Finnhub daily OHLCV data as CSV text compatible with existing tools."""
    datetime.strptime(start_date, "%Y-%m-%d")
    datetime.strptime(end_date, "%Y-%m-%d")

    last_error: Exception | None = None
    for candidate in _try_symbols(symbol):
        try:
            payload = make_api_request(
                "/stock/candle",
                {
                    "symbol": candidate,
                    "resolution": "D",
                    "from": to_unix_timestamp(start_date),
                    "to": to_unix_timestamp(end_date),
                },
                feature_key="enable_stock_data",
            )
            rows = _normalize_candles(candidate, payload, start_date=start_date, end_date=end_date)
            df = pd.DataFrame(rows, columns=["Date", "Open", "High", "Low", "Close", "Volume"])
            warnings: list[str] = []
            if len(df) < 30:
                warnings.append("Partial OHLCV history: fewer than 30 candles returned.")
            header = f"# Finnhub daily stock data for {candidate} from {start_date} to {end_date}\n"
            header += f"# Source: finnhub:/stock/candle\n"
            header += f"# Total records: {len(df)}\n"
            if warnings:
                header += "# Warnings: " + " | ".join(warnings) + "\n"
            header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
            return header + df.to_csv(index=False)
        except Exception as exc:
            last_error = exc
            continue
    return handle_finnhub_error(
        f"stock candle for {symbol}",
        last_error or FinnhubUnavailableError("No valid symbol candidate returned data."),
        fallback_next="alpha_vantage",
    )


def _load_stock_dataframe(symbol: str, curr_date: str, look_back_days: int) -> pd.DataFrame:
    start_dt = datetime.strptime(curr_date, "%Y-%m-%d") - pd.Timedelta(days=max(look_back_days + 260, 320))
    raw = get_stock(symbol, start_dt.strftime("%Y-%m-%d"), curr_date)
    if raw.lower().startswith("finnhub unavailable"):
        raise FinnhubUnavailableError(raw)
    lines = [line for line in raw.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    df = pd.read_csv(StringIO("\n".join(lines)))
    df["Date"] = pd.to_datetime(df["Date"])
    return df.sort_values("Date")


def _indicator_series(df: pd.DataFrame, indicator: str) -> pd.Series:
    close = df["Close"].astype(float)
    high = df["High"].astype(float)
    low = df["Low"].astype(float)
    volume = df["Volume"].astype(float)

    if indicator == "close_50_sma":
        return close.rolling(50).mean()
    if indicator == "close_200_sma":
        return close.rolling(200).mean()
    if indicator == "close_10_ema":
        return close.ewm(span=10, adjust=False).mean()
    if indicator in {"macd", "macds", "macdh"}:
        macd = close.ewm(span=12, adjust=False).mean() - close.ewm(span=26, adjust=False).mean()
        signal = macd.ewm(span=9, adjust=False).mean()
        if indicator == "macd":
            return macd
        if indicator == "macds":
            return signal
        return macd - signal
    if indicator == "rsi":
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, pd.NA)
        return 100 - (100 / (1 + rs))
    if indicator in {"boll", "boll_ub", "boll_lb"}:
        middle = close.rolling(20).mean()
        std = close.rolling(20).std()
        if indicator == "boll":
            return middle
        if indicator == "boll_ub":
            return middle + (2 * std)
        return middle - (2 * std)
    if indicator == "atr":
        prev_close = close.shift(1)
        tr = pd.concat([(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
        return tr.rolling(14).mean()
    if indicator == "vwma":
        return (close * volume).rolling(20).sum() / volume.rolling(20).sum().replace(0, pd.NA)
    if indicator == "mfi":
        typical = (high + low + close) / 3
        flow = typical * volume
        positive = flow.where(typical > typical.shift(1), 0).rolling(14).sum()
        negative = flow.where(typical < typical.shift(1), 0).rolling(14).sum()
        return 100 - (100 / (1 + (positive / negative.replace(0, pd.NA))))
    raise ValueError(f"Indicator {indicator} is not supported by Finnhub fallback.")


def get_indicator(symbol: str, indicator: str, curr_date: str, look_back_days: int = 30) -> str:
    """Calculate supported technical indicators locally from Finnhub candles."""
    df = _load_stock_dataframe(symbol, curr_date, look_back_days)
    values = _indicator_series(df, indicator)
    df = df.assign(value=values)
    cutoff = datetime.strptime(curr_date, "%Y-%m-%d") - pd.Timedelta(days=look_back_days)
    recent = df[(df["Date"] >= cutoff) & (df["Date"] <= pd.to_datetime(curr_date))]

    lines = []
    for _, row in recent.iterrows():
        value = row.get("value")
        if pd.isna(value):
            rendered = "N/A"
        else:
            rendered = f"{float(value):.4f}"
        lines.append(f"{row['Date'].strftime('%Y-%m-%d')}: {rendered}")
    if not lines:
        return f"Finnhub unavailable: indicator {indicator} for {symbol} - no rows in requested window."
    return f"## Finnhub {indicator} values for {symbol} up to {curr_date}\n\n" + "\n".join(lines)


def get_stock_symbols(exchange: str = "US") -> dict[str, Any]:
    return make_api_request("/stock/symbol", {"exchange": exchange}, feature_key="enable_symbol_resolver")


def search_symbol(query: str) -> dict[str, Any]:
    return make_api_request("/search", {"q": query}, feature_key="enable_symbol_resolver")


def get_market_status(exchange: str = "US") -> dict[str, Any]:
    return make_api_request("/stock/market-status", {"exchange": exchange}, feature_key="enable_stock_data")
