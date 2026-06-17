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
        "insider_percent": 0.1,
        "institution_percent": 0.2,
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


def test_profile_builder_normalizes_ownership_fields_and_computes_public_float():
    profile = build_company_profile(
        ticker="BBCA.JK",
        vendor_payloads={
            "yfinance": {
                "available": True,
                "name": "Bank BCA",
                "sharesOutstanding": 122_876_240_600,
                "heldPercentInsiders": 0.60814,
                "heldPercentInstitutions": 0.20815,
                "shortRatio": None,
            }
        },
        vendor_order=["yfinance"],
    )

    assert profile["shares_outstanding"] == 122_876_240_600
    assert profile["shares_out"] == 122_876_240_600
    assert profile["insider_percent"] == 0.60814
    assert profile["insider_pct"] == 0.60814
    assert profile["institution_percent"] == 0.20815
    assert profile["institution_pct"] == 0.20815
    assert round(profile["public_percent"], 5) == 0.18371
    assert round(profile["public_pct"], 5) == 0.18371
    assert profile["short_ratio"] is None
    assert profile["shares_ownership"] == {
        "shares_out": 122_876_240_600,
        "insider_pct": 0.60814,
        "institution_pct": 0.20815,
        "public_pct": profile["public_percent"],
        "short_ratio": None,
    }


def test_profile_builder_computes_public_from_percent_values_above_one():
    profile = build_company_profile(
        ticker="BBCA.JK",
        vendor_payloads={
            "yfinance": {
                "available": True,
                "name": "Bank BCA",
                "insider_percent": 5.03,
                "institution_percent": 44.44,
            }
        },
        vendor_order=["yfinance"],
    )

    assert round(profile["public_percent"], 4) == 0.5053


def test_profile_builder_fetches_yfinance_ownership_after_profile_core_is_filled():
    calls = []

    def fetch(vendor):
        calls.append(vendor)
        if vendor == "idx_official":
            return {
                "available": True,
                "company_name": "PT Bank Central Asia Tbk",
                "ticker": "BBCA.JK",
                "exchange": "IDX",
                "currency": "IDR",
                "country": "Indonesia",
                "sector": "Financial Services",
                "industry": "Banks",
                "business_summary": "Bank profile.",
                "website": "https://www.bca.co.id",
                "market_cap": 1_205_000_000_000,
                "shares_outstanding": 122_876_240_600,
                "current_price": 9800,
                "fiscal_year_end": "December",
                "employee_count": 27_000,
                "officers": [{"name": "Executive", "title": "Director"}],
            }
        return {
            "available": True,
            "ticker": "BBCA.JK",
            "heldPercentInsiders": 0.60814,
            "heldPercentInstitutions": 0.20815,
            "shortRatio": None,
        }

    profile = build_company_profile(
        ticker="BBCA.JK",
        fetch_vendor=fetch,
        vendor_order=["idx_official", "yfinance"],
    )

    assert calls == ["idx_official", "yfinance"]
    assert profile["company_name"] == "PT Bank Central Asia Tbk"
    assert profile["insider_pct"] == 0.60814
    assert profile["institution_pct"] == 0.20815
    assert round(profile["public_pct"], 5) == 0.18371


def test_profile_builder_keeps_yfinance_ratio_fields_for_fundamental_table():
    profile = build_company_profile(
        ticker="TEST",
        vendor_payloads={
            "yfinance": {
                "available": True,
                "longName": "Ratio Corp",
                "enterpriseValue": 1200,
                "trailingPE": 10,
                "priceToBook": 2,
                "priceToSalesTrailing12Months": 1.5,
                "enterpriseToEbitda": 8,
                "enterpriseToRevenue": 1.2,
                "priceToFreeCashFlow": 12,
                "enterpriseToFreeCashFlow": 14,
                "earningsYield": 0.1,
                "freeCashFlowYield": 0.07,
                "dividendYield": 0.03,
                "payoutRatio": 0.4,
                "returnOnEquity": 0.25,
                "returnOnAssets": 0.08,
                "beta": 1.1,
                "floatShares": 900,
                "totalCashPerShare": 5,
            }
        },
        vendor_order=["yfinance"],
    )

    assert profile["enterprise_value"] == 1200
    assert profile["trailing_pe"] == 10
    assert profile["price_to_book"] == 2
    assert profile["price_to_sales"] == 1.5
    assert profile["enterprise_to_ebitda"] == 8
    assert profile["enterprise_to_revenue"] == 1.2
    assert profile["price_to_free_cash_flow"] == 12
    assert profile["enterprise_to_fcf"] == 14
    assert profile["earnings_yield"] == 0.1
    assert profile["fcf_yield"] == 0.07
    assert profile["dividend_yield"] == 0.03
    assert profile["payout_ratio"] == 0.4
    assert profile["return_on_equity"] == 0.25
    assert profile["return_on_assets"] == 0.08
    assert profile["beta"] == 1.1
    assert profile["float_shares"] == 900
    assert profile["total_cash_per_share"] == 5
