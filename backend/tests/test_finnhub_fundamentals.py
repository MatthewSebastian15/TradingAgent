from __future__ import annotations

import json

from tradingagents.dataflows.providers.finnhub_fundamentals import (
    get_basic_financials,
    get_company_profile,
    get_financials,
    get_fundamentals,
)


def test_get_company_profile_success(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.providers.finnhub_fundamentals.make_api_request",
        lambda *a, **k: {"name": "Apple", "finnhubIndustry": "Tech", "marketCapitalization": 1},
    )
    payload = json.loads(get_company_profile("AAPL"))
    assert payload["company"]["name"] == "Apple"


def test_get_basic_financials_success_maps_selected_metrics(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.providers.finnhub_fundamentals.make_api_request",
        lambda *a, **k: {"metric": {"peTTM": 25, "roeTTM": 20, "beta": 1.1}},
    )
    payload = json.loads(get_basic_financials("AAPL"))
    assert payload["metrics"]["pe_ratio"]["source"] == "finnhub"


def test_get_fundamentals_combines_profile_and_metrics(monkeypatch):
    def fake(endpoint, params=None, feature_key=None):
        if endpoint == "/stock/profile2":
            return {"name": "Apple", "finnhubIndustry": "Tech", "marketCapitalization": 1}
        return {"metric": {"peTTM": 25, "roeTTM": 20, "beta": 1.1}}

    monkeypatch.setattr(
        "tradingagents.dataflows.providers.finnhub_fundamentals.make_api_request", fake
    )
    payload = json.loads(get_fundamentals("AAPL"))
    assert payload["company"]["name"] == "Apple"
    assert payload["metrics"]["pe_ratio"]["source"] == "finnhub"


def test_get_financials_success_if_enabled(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.providers.finnhub_fundamentals.make_api_request",
        lambda *a, **k: {"financials": [{"year": 2025, "totalAssets": 1}]},
    )
    payload = json.loads(get_financials("AAPL", "annual"))
    assert payload["financials"][0]["totalAssets"] == 1
