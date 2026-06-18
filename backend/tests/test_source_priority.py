from __future__ import annotations

from tradingagents.dataflows.source_priority import NEWS_PRIORITY, SOURCE_PRIORITY, get_field_vendor_order
from tradingagents.dataflows.vendor_capabilities import SPRINT_1_VENDORS


def test_source_priority_only_uses_sprint_1_vendors():
    for market_fields in SOURCE_PRIORITY.values():
        for vendors in market_fields.values():
            assert set(vendors).issubset(SPRINT_1_VENDORS)


def test_yfinance_first_for_main_market_fields_across_markets():
    fields = ["quote", "history", "chart", "profile", "financials", "market_cap"]
    for market in ["IDX", "ID", "US", "GLOBAL", "CRYPTO", "ETF", "FUND", "UNKNOWN"]:
        for field in fields:
            order = get_field_vendor_order(field, market=market)
            assert order[0] == "yfinance"


def test_us_profile_priority_keeps_alpha_vantage_enrichment_after_finnhub():
    assert get_field_vendor_order("profile", "NVDA") == ["yfinance", "finnhub", "alpha_vantage"]
    assert get_field_vendor_order("profile", market="GLOBAL") == ["yfinance", "finnhub", "alpha_vantage"]


def test_news_priority_only_uses_allowed_news_vendors():
    assert NEWS_PRIORITY == ["yfinance", "google_news_light", "newsdata", "marketaux", "finnhub", "alpha_vantage"]
    for market in ["IDX", "ID", "US", "GLOBAL", "CRYPTO", "ETF", "FUND"]:
        order = get_field_vendor_order("company_news", market=market)
        assert order[0] == "yfinance"
        assert set(order).issubset(set(NEWS_PRIORITY))


def test_unknown_market_priority_is_safe():
    assert get_field_vendor_order("quote", market="UNKNOWN") == ["yfinance"]
    assert get_field_vendor_order("company_news", market="UNKNOWN") == ["yfinance", "google_news_light"]


def test_global_and_crypto_do_not_try_unsupported_fallbacks():
    assert get_field_vendor_order("history", "0700.HK") == ["yfinance"]
    assert get_field_vendor_order("financial_statement", "BTC-USD") == ["yfinance"]


def test_us_financial_statement_uses_all_statement_fallbacks():
    assert get_field_vendor_order("financial_statement", "NVDA") == [
        "yfinance",
        "sec_companyfacts",
        "alpha_vantage",
        "finnhub",
    ]
    assert get_field_vendor_order("news_sentiment", "NVDA") == ["finnhub", "alpha_vantage"]
