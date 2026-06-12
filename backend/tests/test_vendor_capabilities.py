from __future__ import annotations

from tradingagents.company_profile.builder import build_company_profile
from tradingagents.dataflows.vendor_capabilities import (
    SPRINT_1_VENDORS,
    VENDOR_CAPABILITIES,
    get_supported_vendors,
    get_vendor_strength,
    supports_vendor,
    vendor_requires_api_key,
)
from tradingagents.dataflows.vendor_symbol import resolve_symbol


def test_vendor_capability_matrix_only_contains_sprint_1_vendors():
    assert set(VENDOR_CAPABILITIES) == SPRINT_1_VENDORS


def test_supports_vendor_checks_market_and_field():
    assert supports_vendor("yfinance", "IDX", "quote") is True
    assert supports_vendor("google_news_light", "CRYPTO", "news") is True
    assert supports_vendor("alpha_vantage", "IDX", "quote") is False
    assert supports_vendor("unknown_vendor", "US", "quote") is False


def test_vendor_requires_api_key_flags():
    assert vendor_requires_api_key("yfinance") is False
    assert vendor_requires_api_key("google_news_light") is False
    assert vendor_requires_api_key("finnhub") is True
    assert vendor_requires_api_key("alpha_vantage") is True
    assert vendor_requires_api_key("marketaux") is True
    assert vendor_requires_api_key("newsdata") is True


def test_get_vendor_strength_and_supported_vendors():
    assert get_vendor_strength("yfinance", "US", "history") == "best"
    assert get_vendor_strength("alpha_vantage", "IDX", "history") is None
    assert get_supported_vendors("US", "quote") == ["yfinance", "finnhub", "alpha_vantage"]


def test_resolver_keeps_canonical_symbol_and_search_metadata():
    resolution = resolve_symbol(
        "bbca.jk",
        market="IDX",
        search_metadata={
            "canonical": "BBCA.JK",
            "company_name": "PT Bank Central Asia Tbk",
            "quote_type": "EQUITY",
            "exchange": "JKT",
            "aliases": ["BCA"],
        },
    )

    assert resolution.canonical == "BBCA.JK"
    assert resolution.market == "IDX"
    assert resolution.base_ticker == "BBCA"
    assert resolution.company_name == "PT Bank Central Asia Tbk"
    assert resolution.quote_type == "EQUITY"
    assert resolution.search_verified is True
    assert "BCA" in resolution.aliases
    assert resolution.vendor_symbols["yfinance"] == "BBCA.JK"
    assert ".JK" not in resolve_symbol("AAPL", market="US").canonical.replace("AAPL", "")


def test_resolver_warns_when_not_search_verified():
    resolution = resolve_symbol("AAPL")

    assert resolution.canonical == "AAPL"
    assert "symbol_not_search_verified" in resolution.warnings


def test_profile_field_level_fallback_keeps_yfinance_values():
    profile = build_company_profile(
        ticker="AAPL",
        vendor_order=["yfinance", "finnhub"],
        vendor_payloads={
            "yfinance": {
                "ticker": "AAPL",
                "company_name": "Apple Inc.",
                "market_cap": 100,
                "website": None,
            },
            "finnhub": {
                "ticker": "AAPL",
                "company_name": "Fallback Apple Name",
                "market_cap": 200,
                "website": "https://www.apple.com",
            },
        },
    )

    assert profile["company_name"] == "Apple Inc."
    assert profile["market_cap"] == 100
    assert profile["website"] == "https://www.apple.com"
    assert profile["data_quality"]["field_sources"]["company_name"] == "yfinance"
    assert profile["data_quality"]["field_sources"]["website"] == "finnhub"
