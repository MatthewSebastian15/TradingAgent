"""OHLCV candle fetching, normalization, and range caching.

Extracted from routes/market.py so the route handler stays thin. Owns its own
small LRU cache for raw daily candles; reuses `_as_float` from the yfinance
service for cell coercion.
"""

from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timedelta
from time import monotonic
from typing import Any

from errors import BadRequestError
from services.market_yfinance_service import _as_float

_MAX_CACHE_ENTRIES = 500
_OHLCV_CACHE_TTL_SECONDS = 60.0
_OHLCV_CACHE: OrderedDict[tuple[str, str, str], tuple[float, dict[str, Any]]] = OrderedDict()
_OHLCV_RANGE_DAYS = {"1W": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 365, "2Y": 730, "5Y": 1825}
OHLCV_RANGE_OPTIONS = {"YTD", *_OHLCV_RANGE_DAYS.keys()}


def _cache_set(cache: OrderedDict, key, value) -> None:
    cache[key] = value
    cache.move_to_end(key)  # most-recently-used end
    if len(cache) > _MAX_CACHE_ENTRIES:
        cache.popitem(last=False)  # evict least-recently-used


def _cache_get(cache: OrderedDict, key, default=None):
    if key in cache:
        cache.move_to_end(key)  # reads count as use, so LRU tracks access not insertion
        return cache[key]
    return default


def parse_ohlcv_trade_date(value: str | None) -> datetime:
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


def _ohlcv_raw_cache_key(symbol: str, end_dt: datetime, interval: str) -> tuple[str, str, str]:
    return (symbol, end_dt.strftime("%Y-%m-%d"), interval)


def _parse_ohlcv_point_date(point: dict[str, Any]) -> datetime | None:
    raw_date = str(point.get("date") or "").strip()
    if not raw_date:
        return None
    for date_format in ("%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            normalized_date = raw_date[:16] if " " in raw_date else raw_date[:10]
            return datetime.strptime(normalized_date, date_format)
        except ValueError:
            continue
    return None


def _slice_ohlcv_rows(
    rows: list[dict[str, Any]], start_dt: datetime, end_dt: datetime
) -> list[dict[str, Any]]:
    start_date = start_dt.date()
    end_date = end_dt.date()
    sliced: list[dict[str, Any]] = []
    for row in rows:
        point_dt = _parse_ohlcv_point_date(row)
        if point_dt is None:
            continue
        if start_date <= point_dt.date() <= end_date:
            sliced.append(dict(row))
    return sliced


def _cached_ohlcv_rows(
    symbol: str, start_dt: datetime, end_dt: datetime, interval: str, now: float
) -> tuple[bool, list[dict[str, Any]]]:
    cached_at, cached_payload = _cache_get(
        _OHLCV_CACHE, _ohlcv_raw_cache_key(symbol, end_dt, interval), (0.0, {})
    )
    if not cached_payload or now - cached_at > _OHLCV_CACHE_TTL_SECONDS:
        return False, []

    cached_start = str(cached_payload.get("start_date") or "")
    cached_end = str(cached_payload.get("end_date") or "")
    if cached_start > start_dt.strftime("%Y-%m-%d") or cached_end < end_dt.strftime("%Y-%m-%d"):
        return False, []

    rows = cached_payload.get("rows")
    if not isinstance(rows, list):
        return False, []
    return True, _slice_ohlcv_rows(rows, start_dt, end_dt)


def _cache_ohlcv_rows(
    symbol: str,
    start_dt: datetime,
    end_dt: datetime,
    interval: str,
    rows: list[dict[str, Any]],
) -> None:
    _cache_set(
        _OHLCV_CACHE,
        _ohlcv_raw_cache_key(symbol, end_dt, interval),
        (
            monotonic(),
            {
                "ticker": symbol,
                "interval": interval,
                "start_date": start_dt.strftime("%Y-%m-%d"),
                "end_date": end_dt.strftime("%Y-%m-%d"),
                "rows": [dict(row) for row in rows],
            },
        ),
    )


def _build_ohlcv_payload(
    *,
    symbol: str,
    range_key: str,
    interval: str | None,
    requested_start_dt: datetime,
    requested_end_dt: datetime,
    rows: list[dict[str, Any]],
    fallback_to_daily: bool,
    warning: str | None = None,
) -> dict[str, Any]:
    return {
        "available": len(rows) >= 2,
        "source": f"yfinance:{interval}" if interval else "yfinance",
        "ticker": symbol,
        "range": range_key,
        "interval": interval,
        "fallback_to_daily": fallback_to_daily,
        "requested_trade_date": requested_end_dt.strftime("%Y-%m-%d"),
        "start_date": requested_start_dt.strftime("%Y-%m-%d"),
        "end_date": requested_end_dt.strftime("%Y-%m-%d"),
        "last_trade_date": str(rows[-1]["date"])[:10] if rows else None,
        "points": [dict(row) for row in rows],
        "data": [dict(row) for row in rows],
        "data_quality": {
            "status": "complete" if len(rows) >= 2 else "partial" if rows else "unavailable",
            "missing_fields": [] if rows else ["ohlcv"],
            "point_count": len(rows),
        },
        "warning": warning
        if warning is not None
        else None
        if len(rows) >= 2
        else "Only one OHLCV candle was available for this range."
        if rows
        else "No OHLCV candles returned for the selected range.",
    }


def fetch_ohlcv_range(symbol: str, range_key: str, trade_date: str | None) -> dict[str, Any]:
    end_dt = parse_ohlcv_trade_date(trade_date)
    start_dt = _ohlcv_start_date(end_dt, range_key)
    intervals = _ohlcv_intervals(range_key)
    last_error: Exception | None = None

    for interval in intervals:
        now = monotonic()
        cache_hit, cached_rows = _cached_ohlcv_rows(symbol, start_dt, end_dt, interval, now)
        if cache_hit:
            if cached_rows or interval == intervals[-1]:
                return _build_ohlcv_payload(
                    symbol=symbol,
                    range_key=range_key,
                    interval=interval,
                    requested_start_dt=start_dt,
                    requested_end_dt=end_dt,
                    rows=cached_rows,
                    fallback_to_daily=interval == "1d" and intervals[0] != "1d",
                )
            continue

        try:
            rows = _normalize_ohlcv_rows(
                _download_ohlcv(symbol, start_dt, end_dt, interval), start_dt, end_dt, interval
            )
            _cache_ohlcv_rows(symbol, start_dt, end_dt, interval, rows)
            if not rows:
                continue
            if len(rows) < 2 and interval != intervals[-1]:
                continue
            return _build_ohlcv_payload(
                symbol=symbol,
                range_key=range_key,
                interval=interval,
                requested_start_dt=start_dt,
                requested_end_dt=end_dt,
                rows=rows,
                fallback_to_daily=interval == "1d" and intervals[0] != "1d",
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            import logging  # noqa: PLC0415

            logging.getLogger(__name__).debug(
                "OHLCV fetch failed for %s %s %s: %s", symbol, range_key, interval, exc
            )

    warning = str(last_error or "No OHLCV candles returned for the selected range.")
    return _build_ohlcv_payload(
        symbol=symbol,
        range_key=range_key,
        interval=None,
        requested_start_dt=start_dt,
        requested_end_dt=end_dt,
        rows=[],
        fallback_to_daily=intervals[-1] == "1d" and intervals[0] != "1d",
        warning=warning,
    )
