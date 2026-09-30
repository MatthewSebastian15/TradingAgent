from __future__ import annotations

from datetime import date

from tradingagents.pipeline.price_anchor import business_days_between, resolve_price_anchor

QUOTE = {
    "current_price": 102.0,
    "previous_close": 100.0,
    "timestamp": "2026-09-14T14:30:00+00:00",
    "source": "yfinance:live_quote",
    "market_state": "open",
    "delay_minutes": 15,
    "timestamp_is_fetch_time": False,
    "fetched_at": "2026-09-14T14:31:00+00:00",
}


def test_business_days_skip_weekend():
    assert business_days_between(date(2026, 9, 11), date(2026, 9, 14)) == 1  # Fri -> Mon
    assert business_days_between(date(2026, 9, 14), date(2026, 9, 14)) == 0


def test_live_quote_is_the_anchor_when_consistent():
    anchor = resolve_price_anchor(
        live_quote=QUOTE,
        ohlcv_price=101.8,
        ohlcv_as_of="2026-09-14",
        ohlcv_source="yfinance:last_close",
        trade_date="2026-09-14",
    )
    assert anchor["price"] == 102.0
    assert anchor["as_of"] == QUOTE["timestamp"]
    assert anchor["is_fallback"] is False
    assert anchor["quote_check"]["status"] == "ok"
    assert anchor["quote_check"]["delay_minutes"] == 15
    assert anchor["warnings"] == []


def test_prior_day_bar_is_compared_with_quote_previous_close():
    anchor = resolve_price_anchor(
        live_quote=QUOTE,
        ohlcv_price=100.1,
        ohlcv_as_of="2026-09-11",
        ohlcv_source="yfinance:last_close",
        trade_date="2026-09-14",
    )
    assert anchor["quote_check"]["deviation_pct"] == 0.1
    assert anchor["quote_check"]["price_conflict"] is False


def test_same_day_disagreement_flags_conflict():
    anchor = resolve_price_anchor(
        live_quote=QUOTE,
        ohlcv_price=90.0,
        ohlcv_as_of="2026-09-14",
        ohlcv_source="yfinance:last_close",
        trade_date="2026-09-14",
    )
    assert anchor["quote_check"]["status"] == "conflict"
    assert anchor["quote_check"]["price_conflict"] is True
    assert "QUOTE_OHLCV_DEVIATION" in anchor["warnings"]


def test_missing_quote_falls_back_to_ohlcv_and_marks_fallback():
    anchor = resolve_price_anchor(
        live_quote={"available": False},
        ohlcv_price=100.0,
        ohlcv_as_of="2026-09-14",
        ohlcv_source="yfinance:last_close",
        trade_date="2026-09-14",
    )
    assert anchor["price"] == 100.0
    assert anchor["is_fallback"] is True
    assert anchor["quote_check"]["status"] == "fallback"
    assert "LIVE_QUOTE_UNAVAILABLE" in anchor["warnings"]


def test_old_price_is_stale():
    anchor = resolve_price_anchor(
        live_quote=None,
        ohlcv_price=100.0,
        ohlcv_as_of="2026-09-01",
        ohlcv_source="yfinance:last_close",
        trade_date="2026-09-14",
    )
    assert anchor["quote_check"]["status"] == "stale"
    assert anchor["quote_check"]["price_stale"] is True
    assert "PRICE_STALE" in anchor["warnings"]


def test_no_price_at_all_is_unavailable():
    anchor = resolve_price_anchor(
        live_quote=None,
        ohlcv_price=None,
        ohlcv_as_of=None,
        ohlcv_source=None,
        trade_date="2026-09-14",
    )
    assert anchor["price"] is None
    assert anchor["quote_check"]["status"] == "unavailable"


def test_live_quote_applies_only_near_today():
    from tradingagents.pipeline.price_anchor import live_quote_applies

    today = date(2026, 9, 30)
    assert live_quote_applies("2026-09-30", today=today) is True
    assert live_quote_applies("2026-10-01", today=today) is True  # +1 day is allowed upstream
    assert live_quote_applies("2026-09-28", today=today) is True
    assert live_quote_applies("2026-06-01", today=today) is False
    assert live_quote_applies("garbage", today=today) is False
