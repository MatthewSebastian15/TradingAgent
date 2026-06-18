from __future__ import annotations

import json

from tradingagents.dataflows.finnhub_sentiment import get_news_sentiment, get_social_sentiment


def test_get_news_sentiment_success(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_sentiment.make_api_request",
        lambda *a, **k: {"sentiment": {"companyNewsScore": 0.4, "bullishPercent": 0.6}},
    )
    payload = json.loads(get_news_sentiment("AAPL"))
    assert payload["available"] is True


def test_get_news_sentiment_empty_unavailable(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_sentiment.make_api_request", lambda *a, **k: {}
    )
    text = get_news_sentiment("AAPL")
    assert text.lower().startswith("finnhub unavailable")


def test_get_social_sentiment_success(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_sentiment.make_api_request",
        lambda *a, **k: {"reddit": [{"mention": 2, "positiveMention": 2}], "twitter": []},
    )
    payload = json.loads(get_social_sentiment("AAPL", "2026-05-01", "2026-05-28"))
    assert payload["summary"]["total_mentions"] == 2


def test_social_sentiment_does_not_use_news_as_direct_fallback(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_sentiment.make_api_request",
        lambda *a, **k: {"reddit": [], "twitter": []},
    )
    payload = json.loads(get_social_sentiment("AAPL", "2026-05-01", "2026-05-28"))
    assert payload["available"] is False
    assert "do not label" in payload["fallback"].lower()
