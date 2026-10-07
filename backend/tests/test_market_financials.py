from __future__ import annotations

import routes.market as market_routes
from services.market import financials_service as svc

_HIGHLIGHTS = {
    "currency": "USD",
    "unit_note": "USD millions",
    "periods": [
        {"key": "FY24", "label": "FY24"},
        {"key": "FY25", "label": "FY25"},
    ],
    "sections": [
        {
            "key": "income",
            "rows": [
                {
                    "key": "revenue",
                    "label": "Revenue",
                    "unit": "USD mn",
                    "values": {
                        "FY24": {"display": "100", "status": "reported", "value": 100.0},
                        "FY25": {"display": "120", "status": "reported", "value": 120.0},
                    },
                }
            ],
        },
        {
            "key": "balance_sheet",
            "rows": [
                {
                    "key": "total_assets",
                    "label": "Total Assets",
                    "unit": "USD mn",
                    "values": {
                        "FY24": {"display": "-", "status": "unavailable", "value": None},
                        "FY25": {"display": "900", "status": "reported", "value": 900.0},
                    },
                }
            ],
        },
    ],
    "data_quality": {"status": "partial"},
}


def _patch(monkeypatch, calls=None):
    svc.market_cache.clear()

    def fake_build(symbol):
        if calls is not None:
            calls.append(symbol)
        return _HIGHLIGHTS

    monkeypatch.setattr(svc, "_build_financials", fake_build)


def test_get_financials_selects_the_requested_statement(monkeypatch):
    _patch(monkeypatch)

    income = svc.get_financials_cached("AAPL", "income")
    balance = svc.get_financials_cached("AAPL", "balance")

    assert income["statement"] == "income"
    assert income["periods"] == [{"key": "FY24", "label": "FY24"}, {"key": "FY25", "label": "FY25"}]
    assert income["rows"][0]["label"] == "Revenue"
    assert income["rows"][0]["values"] == {"FY24": "100", "FY25": "120"}
    assert balance["rows"][0]["label"] == "Total Assets"
    assert balance["rows"][0]["values"]["FY24"] == "-"
    assert income["currency"] == "USD"


def test_both_statements_share_one_vendor_fetch(monkeypatch):
    calls: list[str] = []
    _patch(monkeypatch, calls)

    svc.get_financials_cached("AAPL", "income")
    svc.get_financials_cached("AAPL", "balance")
    svc.get_financials_cached("AAPL", "income")

    assert calls == ["AAPL"]


def test_unavailable_financials_are_cached_briefly(monkeypatch):
    svc.market_cache.clear()
    monkeypatch.setattr(
        svc,
        "_build_financials",
        lambda s: {**_HIGHLIGHTS, "data_quality": {"status": "unavailable"}},
    )

    svc.get_financials_cached("ZZZ", "income")

    assert svc.market_cache._items["financials:ZZZ"][1] == svc.DEGRADED_FINANCIALS_TTL_SECONDS


def test_complete_financials_use_the_long_ttl(monkeypatch):
    _patch(monkeypatch)

    svc.get_financials_cached("AAPL", "income")

    assert svc.market_cache._items["financials:AAPL"][1] == svc.FINANCIALS_TTL_SECONDS == 3600


def test_vendor_exception_degrades_to_unavailable_instead_of_raising(monkeypatch):
    svc.market_cache.clear()

    def boom(_symbol):
        raise RuntimeError("vendor down")

    monkeypatch.setattr(svc, "_fetch_statements", boom)

    result = svc.get_financials_cached("AAPL", "income")

    assert result["data_quality"]["status"] == "unavailable"
    assert result["rows"] == []


def test_financials_route_forwards_and_validates(client, monkeypatch):
    seen = []
    monkeypatch.setattr(
        market_routes,
        "get_financials_cached",
        lambda symbol, statement: seen.append((symbol, statement)) or {"rows": []},
    )

    assert client.get("/api/market/financials?ticker=aapl&statement=balance").status_code == 200
    assert client.get("/api/market/financials?ticker=AAPL").status_code == 200
    assert seen == [("AAPL", "balance"), ("AAPL", "income")]
    assert client.get("/api/market/financials?ticker=AAPL&statement=cashflow").status_code == 422
    assert client.get("/api/market/financials?ticker=AAPL;DROP").status_code == 400
