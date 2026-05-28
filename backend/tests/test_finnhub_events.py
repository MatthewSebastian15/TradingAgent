from __future__ import annotations

import json

from tradingagents.dataflows.finnhub_events import classify_earnings_risk, get_earnings_calendar, get_recommendation_trends, get_stock_earnings


def test_classify_earnings_risk_high_medium_low():
    assert classify_earnings_risk(3) == "high"
    assert classify_earnings_risk(20) == "medium"
    assert classify_earnings_risk(90) == "low"


def test_get_earnings_calendar_success(monkeypatch):
    monkeypatch.setattr("tradingagents.dataflows.finnhub_events.make_api_request", lambda *a, **k: {"earningsCalendar": [{"date": "2026-05-30"}]})
    payload = json.loads(get_earnings_calendar("AAPL", "2026-05-28", "2026-06-30"))
    assert payload["event_risk"]["risk_level"] == "high"


def test_get_stock_earnings_success(monkeypatch):
    monkeypatch.setattr("tradingagents.dataflows.finnhub_events.make_api_request", lambda *a, **k: [{"period": "2026-Q1", "surprise": 1}])
    payload = json.loads(get_stock_earnings("AAPL"))
    assert payload["historical_earnings"][0]["surprise"] == 1


def test_get_recommendation_trends_success(monkeypatch):
    monkeypatch.setattr("tradingagents.dataflows.finnhub_events.make_api_request", lambda *a, **k: [{"buy": 10, "hold": 5}])
    payload = json.loads(get_recommendation_trends("AAPL"))
    assert "external comparison" in payload["usage_note"]
