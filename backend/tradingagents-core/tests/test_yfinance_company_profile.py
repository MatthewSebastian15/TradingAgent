from types import SimpleNamespace

from tradingagents import pipeline_balanced_data
from tradingagents.dataflows import y_finance


def test_get_company_profile_returns_clean_frontend_payload(monkeypatch):
    officers = [{"name": f" Executive {index} ", "title": " Director ", "totalPay": 1_000_000} for index in range(12)]
    info = {
        "longName": " Example  Company ",
        "sector": " Technology ",
        "industry": " Software ",
        "address1": " Main Street ",
        "city": " Jakarta ",
        "country": " Indonesia ",
        "phone": " 021 123 ",
        "website": " https://example.com ",
        "fullTimeEmployees": 1234,
        "longBusinessSummary": "x" * 2100,
        "companyOfficers": officers,
    }
    monkeypatch.setattr(y_finance, "_get_ticker", lambda _ticker: SimpleNamespace(info=info))
    monkeypatch.setattr(y_finance, "yf_retry", lambda func: func())

    profile = y_finance.get_company_profile("bbca")

    assert profile["available"] is True
    assert profile["ticker"] == "BBCA.JK"
    assert profile["name"] == "Example Company"
    assert profile["address"] == "Main Street, Jakarta, Indonesia"
    assert len(profile["description"]) == 2000
    assert profile["description"].endswith("...")
    assert len(profile["executives"]) == 10
    assert profile["executives"][0] == {"name": "Executive 0", "title": "Director"}
    assert "totalPay" not in profile["executives"][0]


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
        lambda *_args: (_ for _ in ()).throw(RuntimeError("provider down")),
    )

    profile = pipeline_balanced_data._safe_company_profile("BBCA.JK", "2026-05-31")

    assert profile == {
        "available": False,
        "ticker": "BBCA.JK",
        "warning": "provider down",
    }
