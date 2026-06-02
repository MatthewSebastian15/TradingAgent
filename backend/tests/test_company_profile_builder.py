from __future__ import annotations

from tradingagents.company_profile.builder import build_company_profile


def test_profile_builder_uses_selective_fallback_and_normalizes_finnhub_millions():
    calls = []

    def fetch(vendor):
        calls.append(vendor)
        if vendor == "yfinance":
            return {"available": True, "ticker": "BBCA.JK", "name": "Bank BCA", "currency": "IDR"}
        if vendor == "finnhub":
            return {
                "source": "finnhub",
                "company": {
                    "exchange": "IDX",
                    "country": "ID",
                    "industry": "Banking",
                    "market_cap": 1_205_000,
                    "share_outstanding": 123_275,
                },
            }
        return {"Name": "Bank BCA", "Sector": "Financial Services", "FiscalYearEnd": "December"}

    profile = build_company_profile(ticker="BBCA.JK", fetch_vendor=fetch)

    assert calls == ["yfinance", "finnhub", "alpha_vantage"]
    assert profile["company_name"] == "Bank BCA"
    assert profile["market_cap"] == 1_205_000_000_000
    assert profile["shares_outstanding"] == 123_275_000_000
    assert profile["fiscal_year_end"] == "December"
    assert profile["data_quality"]["field_sources"]["market_cap"] == "finnhub"


def test_profile_builder_stops_after_complete_yfinance_payload():
    payload = {
        "company_name": "Complete Corp",
        "ticker": "COMP",
        "exchange": "NASDAQ",
        "currency": "USD",
        "country": "United States",
        "sector": "Technology",
        "industry": "Software",
        "business_summary": "Complete profile.",
        "website": "https://example.com",
        "market_cap": 1_000_000,
        "shares_outstanding": 100_000,
        "current_price": 10,
        "fiscal_year_end": "December",
        "employee_count": 100,
        "officers": [{"name": "Executive", "title": "CEO"}],
    }
    calls = []

    profile = build_company_profile(
        ticker="COMP",
        fetch_vendor=lambda vendor: calls.append(vendor) or payload,
    )

    assert calls == ["yfinance"]
    assert profile["data_quality"]["status"] == "complete"
