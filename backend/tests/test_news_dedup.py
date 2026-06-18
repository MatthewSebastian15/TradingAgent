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

from datetime import datetime, timezone

from tradingagents.dataflows.news_deduplication import deduplicate_news_articles
from tradingagents.dataflows.news_models import NormalizedNewsArticle


def test_normalized_news_dedupe_prefers_direct_rss_over_google_fallback():
    fallback = NormalizedNewsArticle(
        provider="rss_context",
        ticker="GENERAL",
        title="Stocks rally after earnings",
        summary="Fallback summary.",
        url="https://example.com/story?utm_source=google",
        source="GOOGLE NEWS",
        category="markets",
        feed_id="bloomberg-markets-google-news",
        feed_tier=3,
        published_at=datetime(2026, 6, 15, tzinfo=timezone.utc),
        relevance_score=100,
        market_context_only=True,
    )
    direct = NormalizedNewsArticle(
        provider="rss_context",
        ticker="GENERAL",
        title="Stocks rally after earnings",
        summary="Direct summary.",
        url="https://example.com/story?cmpid=socialflow",
        source="WSJ",
        category="markets",
        feed_id="wsj-markets",
        feed_tier=2,
        published_at=datetime(2026, 6, 14, tzinfo=timezone.utc),
        relevance_score=80,
        market_context_only=True,
    )

    deduped = deduplicate_news_articles([fallback, direct])

    assert len(deduped) == 1
    assert deduped[0].source == "WSJ"
