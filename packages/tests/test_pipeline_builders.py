"""Direct unit tests for the pure helpers in pipeline/builders.py."""

from tradingagents.pipeline.builders import (
    _currency_for_ticker,
    _deduplicate_news_sections,
    _extract_last_close_price_and_date,
    _horizon_days,
    _normalize_time_horizon_months,
    _safe_float,
    _safe_int,
    _time_horizon_label,
    _truncate,
)


def test_time_horizon_normalization():
    assert _normalize_time_horizon_months(2) == 2
    assert _normalize_time_horizon_months("3") == 3
    assert _normalize_time_horizon_months(5) == 1  # outside {1,2,3}
    assert _normalize_time_horizon_months(None) == 1
    assert _normalize_time_horizon_months(True) == 1  # bool is not a horizon
    assert _time_horizon_label(1) == "1 month"
    assert _time_horizon_label(3) == "3 months"
    assert _horizon_days(2) == 60


def test_truncate_prefers_line_boundary():
    short = "abc"
    assert _truncate(short) == short
    assert _truncate(None) == ""
    text = "line one\nline two\nline three"
    truncated = _truncate(text, limit=15)
    assert truncated.startswith("line one")
    assert truncated.endswith("[TRUNCATED FOR TOKEN CONTROL]")
    assert "line three" not in truncated


def test_deduplicate_news_sections_by_title():
    part_a = "## Vendor A news\n### Big Story (source: a)\nbody a"
    part_b = "## Vendor B news\n### Big Story (source: b)\nbody b\n### Other Story\nbody c"
    deduped = _deduplicate_news_sections([part_a, part_b])
    joined = "\n".join(deduped)
    assert joined.count("Big Story") == 1
    assert "Other Story" in joined
    # non-news parts pass through untouched
    assert _deduplicate_news_sections(["## Fundamentals\ndata"]) == ["## Fundamentals\ndata"]


CSV = "Date,Close\n2026-06-29,10.0\n2026-06-30,11.5\n2026-07-05,12.0\n"


def test_extract_last_close_at_or_before_trade_date():
    price, as_of = _extract_last_close_price_and_date(CSV, "2026-07-01")
    assert price == 11.5
    assert as_of == "2026-06-30"


def test_extract_last_close_respects_fallback_window():
    price, as_of = _extract_last_close_price_and_date(CSV, "2026-07-30", max_fallback_days=3)
    assert price is None
    assert as_of is None


def test_extract_last_close_empty_input():
    assert _extract_last_close_price_and_date("", "2026-07-01") == (None, None)


def test_safe_float_and_int():
    assert _safe_float("1,234.5") == 1234.5
    assert _safe_float("nan") is None
    assert _safe_float("inf") is None
    assert _safe_float("") is None
    assert _safe_float(None) is None
    assert _safe_int("42.9") == 42
    assert _safe_int("junk") is None


def test_currency_for_ticker_suffixes():
    assert _currency_for_ticker("BBCA.JK") == "IDR"
    assert _currency_for_ticker("0700.HK") == "HKD"
    assert _currency_for_ticker("7203.T") == "JPY"
    assert _currency_for_ticker("SAP.DE") == "EUR"
    assert _currency_for_ticker("HSBA.L") == "GBP"
    assert _currency_for_ticker("AAPL") == "USD"
    assert _currency_for_ticker(None) == "USD"
