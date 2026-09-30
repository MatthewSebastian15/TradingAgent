from __future__ import annotations

from datetime import date
from typing import Any

DEFAULT_MAX_STALE_BUSINESS_DAYS = 2
DEFAULT_MAX_QUOTE_DEVIATION_PCT = 5.0


def business_days_between(start: date, end: date) -> int:
    # ponytail: weekends only, no exchange holiday calendar; the 2-day default absorbs a holiday.
    return sum(
        1
        for ordinal in range(start.toordinal() + 1, end.toordinal() + 1)
        if date.fromordinal(ordinal).weekday() < 5
    )


def _parse_date(value: Any) -> date | None:
    text = str(value or "").strip()
    try:
        return date.fromisoformat(text[:10]) if len(text) >= 10 else None
    except ValueError:
        return None


def _positive(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 and number == number else None


def _deviation_pct(value: float, reference: float) -> float:
    return round(abs(value - reference) / reference * 100, 2)


def resolve_price_anchor(
    *,
    live_quote: dict[str, Any] | None,
    ohlcv_price: float | None,
    ohlcv_as_of: str | None,
    ohlcv_source: str | None,
    trade_date: str,
    max_stale_business_days: int = DEFAULT_MAX_STALE_BUSINESS_DAYS,
    max_deviation_pct: float = DEFAULT_MAX_QUOTE_DEVIATION_PCT,
) -> dict[str, Any]:
    quote = live_quote if isinstance(live_quote, dict) else {}
    quote_price = None if quote.get("available") is False else _positive(quote.get("current_price"))
    warnings: list[str] = []

    if quote_price is not None:
        price, as_of = quote_price, quote.get("timestamp")
        source, is_fallback = quote.get("source") or "live_quote", False
    elif ohlcv_price is not None:
        price, as_of = ohlcv_price, ohlcv_as_of
        source, is_fallback = ohlcv_source or "yfinance:last_close", True
        warnings.append("LIVE_QUOTE_UNAVAILABLE")
    else:
        price = as_of = source = None
        is_fallback = False
        warnings.append("PRICE_UNAVAILABLE")

    anchor_date = _parse_date(as_of)
    deviation = None
    if quote_price is not None and ohlcv_price:
        if _parse_date(ohlcv_as_of) == anchor_date:
            deviation = _deviation_pct(quote_price, ohlcv_price)
        elif _positive(quote.get("previous_close")) is not None:
            deviation = _deviation_pct(_positive(quote.get("previous_close")), ohlcv_price)
    conflict = deviation is not None and deviation > max_deviation_pct
    if conflict:
        warnings.append("QUOTE_OHLCV_DEVIATION")

    trade_day = _parse_date(trade_date)
    stale_days = (
        business_days_between(anchor_date, trade_day) if anchor_date and trade_day else None
    )
    stale = price is not None and (stale_days is None or stale_days > max_stale_business_days)
    if stale:
        warnings.append("PRICE_STALE")

    if price is None:
        status = "unavailable"
    elif stale:
        status = "stale"
    elif conflict:
        status = "conflict"
    elif is_fallback:
        status = "fallback"
    else:
        status = "ok"

    return {
        "price": price,
        "as_of": as_of,
        "source": source,
        "is_fallback": is_fallback,
        "quote_check": {
            "status": status,
            "quote_price": quote_price,
            "ohlcv_close": ohlcv_price,
            "ohlcv_as_of": ohlcv_as_of,
            "deviation_pct": deviation,
            "stale_business_days": stale_days,
            "market_state": quote.get("market_state"),
            "delay_minutes": quote.get("delay_minutes"),
            "timestamp_is_fetch_time": bool(quote.get("timestamp_is_fetch_time")),
            "fetched_at": quote.get("fetched_at"),
            "price_stale": stale,
            "price_conflict": conflict,
        },
        "warnings": warnings,
    }
