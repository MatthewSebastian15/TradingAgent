from __future__ import annotations

from tradingagents.dataflows.news_dedup import dedup_news_articles, dedup_news_articles_with_metadata


def test_news_dedup_title_same_day_topic():
    articles = [
        {"title": "BBCA reports strong profit", "url": "https://a.com/1", "published_at": "2026-06-05", "event_type": "earnings"},
        {"title": "BBCA reports strong profit!", "url": "https://b.com/2", "published_at": "2026-06-05", "event_type": "earnings"},
        {"title": "BBCA announces dividend", "url": "https://b.com/3", "published_at": "2026-06-05", "event_type": "dividend"},
    ]
    deduped, meta = dedup_news_articles_with_metadata(articles)
    assert len(deduped) == 2
    assert meta["dedup_removed_count"] == 1
    assert len(dedup_news_articles(articles)) == 2
