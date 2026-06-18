from types import SimpleNamespace

from tradingagents import pipeline_balanced_data
from tradingagents.dataflows import y_finance


def test_get_company_profile_returns_clean_frontend_payload(monkeypatch):
    officers = [{"name": f" Executive {index} ", "title": " Director ", "totalPay": 1_000_000} for index in range(12)]
    info = {
        "longName": " Example  Company ",
        "sectorDisp": " Technology ",
        "industryDisp": " Software ",
        "address1": " Main Street ",
        "city": " Jakarta ",
        "country": " Indonesia ",
        "phone": " 021 123 ",
        "website": " https://example.com ",
        "fullTimeEmployees": 1234,
        "longBusinessSummary": "x" * 2100,
        "sharesOutstanding": 122_876_240_600,
        "heldPercentInsiders": 0.60814,
        "heldPercentInstitutions": 0.20815,
        "shortRatio": None,
        "companyOfficers": officers,
    }
    monkeypatch.setattr(y_finance, "_get_ticker", lambda _ticker: SimpleNamespace(info=info))
    monkeypatch.setattr(y_finance, "yf_retry", lambda func: func())
    monkeypatch.setattr(
        y_finance,
        "fetch_current_price",
        lambda *_args, **_kwargs: {
            "price": None,
            "price_source": "test",
            "price_timestamp": "2026-06-18",
        },
    )

    profile = y_finance.get_company_profile("bbca")

    assert profile["available"] is True
    assert profile["ticker"] == "BBCA.JK"
    assert profile["name"] == "Example Company"
    assert profile["sector"] == "Technology"
    assert profile["industry"] == "Software"
    assert profile["address"] == "Main Street, Jakarta, Indonesia"
    assert profile["employee_count"] == 1234
    assert profile["full_time_employees"] == 1234
    assert profile["shares_outstanding"] == 122_876_240_600
    assert profile["shares_out"] == 122_876_240_600
    assert profile["insider_percent"] == 0.60814
    assert profile["insider_pct"] == 0.60814
    assert profile["institution_percent"] == 0.20815
    assert profile["institution_pct"] == 0.20815
    assert profile["public_percent"] == 0.18371000000000004
    assert profile["public_pct"] == 0.18371000000000004
    assert profile["short_ratio"] is None
    assert profile["shares_ownership"] == {
        "shares_out": 122_876_240_600,
        "insider_pct": 0.60814,
        "institution_pct": 0.20815,
        "public_pct": 0.18371000000000004,
        "short_ratio": None,
    }
    assert len(profile["business_summary"]) == 2000
    assert profile["business_summary"].endswith("...")
    assert len(profile["description"]) == 2000
    assert profile["description"].endswith("...")
    assert len(profile["executives"]) == 10
    assert profile["executives"][0] == {"name": "Executive 0", "title": "Director"}
    assert "totalPay" not in profile["executives"][0]


def test_get_company_profile_keeps_profile_when_price_anchor_fails(monkeypatch):
    info = {
        "longName": " NVIDIA Corporation ",
        "sector": " Technology ",
        "industry": " Semiconductors ",
        "country": " United States ",
        "currency": " USD ",
        "marketCap": 4_000_000_000_000,
        "fullTimeEmployees": 36_000,
    }

    monkeypatch.setattr(y_finance, "_get_ticker", lambda _ticker: SimpleNamespace(info=info))
    monkeypatch.setattr(y_finance, "yf_retry", lambda func: func())
    monkeypatch.setattr(
        y_finance,
        "fetch_current_price",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("price offline")),
    )

    profile = y_finance.get_company_profile("NVDA")

    assert profile["available"] is True
    assert profile["name"] == "NVIDIA Corporation"
    assert profile["sector"] == "Technology"
    assert profile["industry"] == "Semiconductors"
    assert profile["employee_count"] == 36_000
    assert profile["current_price_source"] == "unavailable"


def test_get_company_profile_returns_unavailable_payload_on_error(monkeypatch):
    monkeypatch.setattr(y_finance, "_get_ticker", lambda _ticker: SimpleNamespace(info={}))
    monkeypatch.setattr(y_finance, "yf_retry", lambda _func: (_ for _ in ()).throw(RuntimeError("offline")))

    profile = y_finance.get_company_profile("AAPL")

    assert profile["available"] is False
    assert profile["ticker"] == "AAPL"
    assert "offline" in profile["warning"]


def test_safe_company_profile_keeps_pipeline_running_on_vendor_error(monkeypatch):
    monkeypatch.setattr(
        pipeline_balanced_data,
        "route_to_vendor",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("provider down")),
    )

    profile = pipeline_balanced_data._safe_company_profile("BBCA.JK", "2026-05-31")

    assert profile["available"] is False
    assert profile["ticker"] == "BBCA.JK"
    assert profile["data_quality"]["status"] == "unavailable"
    assert profile["data_quality"]["warnings"] == [
        "yfinance: provider down",
        "finnhub: provider down",
        "alpha_vantage: provider down",
    ]
