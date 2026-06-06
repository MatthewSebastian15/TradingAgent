from __future__ import annotations

from tradingagents.dataflows.source_priority import get_field_vendor_order


def test_idx_financial_statement_priority():
    assert get_field_vendor_order("financial_statement", "BBCA.JK")[0] == "idx_official"


def test_us_financial_statement_does_not_use_idx():
    assert "idx_official" not in get_field_vendor_order("financial_statement", "AAPL")


def test_idx_insider_uses_yfinance_before_finnhub():
    order = get_field_vendor_order("insider_transactions", "BBCA.JK")
    assert order.index("yfinance") < order.index("finnhub")


def test_idx_shareholders_uses_idx_official_first():
    assert get_field_vendor_order("shareholders", "BBCA.JK")[0] == "idx_official"


def test_global_news_has_field_specific_order():
    assert get_field_vendor_order("global_news", "BBCA.JK")[:2] == ["finnhub", "alpha_vantage"]


def test_company_news_uses_google_news_light_first():
    assert get_field_vendor_order("company_news", "BBCA.JK")[0] == "google_news_light"


def test_profile_priority_is_market_aware():
    assert get_field_vendor_order("profile", "BBCA.JK")[0] == "idx_official"
    assert get_field_vendor_order("profile", "AAPL")[0] == "finnhub"
