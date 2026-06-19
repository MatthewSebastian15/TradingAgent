from __future__ import annotations

from tradingagents.dataflows.news.news_aggregator import normalize_url, rank_news
from tradingagents.dataflows.providers.finnhub_news import (
    classify_event_type,
    deduplicate_news,
    get_news,
    normalize_news_item,
)


def test_normalize_news_item_converts_timestamp():
    item = normalize_news_item(
        {"headline": "Earnings beat", "datetime": 1779840000, "source": "Wire"}, ticker="AAPL"
    )
    assert item["published_at"].startswith("2026")
    assert item["event_type"] == "earnings"


def test_news_event_classifier_dividend():
    assert classify_event_type("Company raises dividend") == "dividend"


def test_news_deduplicate_by_url():
    rows = [
        {"title": "A", "url": "https://x.test/a?utm_source=1"},
        {"title": "B", "url": "https://x.test/a"},
    ]
    assert len(deduplicate_news(rows)) == 1


def test_news_deduplicate_by_title():
    rows = [{"title": "Same news!", "url": ""}, {"title": "same news", "url": ""}]
    assert len(deduplicate_news(rows)) == 1


def test_news_rank_by_recency():
    rows = [
        {"title": "old", "published_at": "2026-01-01"},
        {"title": "new", "published_at": "2026-05-01"},
    ]
    assert rank_news(rows)[0]["title"] == "new"


def test_get_news_success_normalizes_items(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.providers.finnhub_news.make_api_request",
        lambda *a, **k: [{"headline": "AAPL earnings", "datetime": 1779840000, "source": "Wire"}],
    )
    text = get_news("AAPL", "2026-05-01", "2026-05-28")
    assert "AAPL earnings" in text
    assert "Event type: earnings" in text


def test_normalize_url_drops_tracking():
    assert normalize_url("HTTPS://Example.COM/a/?utm_source=x") == "https://example.com/a"
