from __future__ import annotations

from datetime import datetime, timedelta, timezone

from services.news_article_store import NewsArticleStore, build_content_hash, normalize_title


def _article(title: str, *, url: str, published_at: str | None = None) -> dict:
    return {
        "id": title,
        "title": title,
        "description": title,
        "url": url,
        "source": "Example",
        "source_domain": "example.com",
        "provider": "rss_context",
        "category": "markets",
        "published_at": published_at
        or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "impact": "LOW",
        "sentiment": "NEUTRAL",
    }


def test_normalize_title_and_content_hash_are_stable():
    assert normalize_title("  Stocks   Gain  ") == "stocks gain"
    assert build_content_hash("Stocks Gain", "https://example.com/a#section") == build_content_hash(
        " stocks  gain ", "https://example.com/a"
    )


def test_store_dedups_duplicate_articles_by_hash(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"))
    url = "https://example.com/story"

    store.upsert_many([_article("Stocks gain", url=url), _article("Stocks gain", url=url)])
    result = store.list_articles(category="all", window_days=7, limit=100)

    assert result.total_available == 1
    assert result.articles[0]["title"] == "Stocks gain"


def test_store_filters_by_category_window_and_limit(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"))
    old_date = (datetime.now(timezone.utc) - timedelta(days=40)).isoformat().replace("+00:00", "Z")
    store.upsert_many(
        [
            _article("Market news", url="https://example.com/market"),
            {**_article("Crypto news", url="https://example.com/crypto"), "category": "crypto"},
            _article("Old market news", url="https://example.com/old", published_at=old_date),
        ]
    )

    result = store.list_articles(category="markets", window_days=7, limit=1)

    assert result.total_available == 1
    assert [article["title"] for article in result.articles] == ["Market news"]


def test_store_retention_cleanup_removes_old_articles(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"), retention_days=7)
    old_date = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    store.upsert_many([_article("Old", url="https://example.com/old", published_at=old_date)])

    result = store.list_articles(category="all", window_days=365, limit=10)

    assert result.articles == []


def test_store_max_articles_guard_keeps_newest(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"), max_articles=1)
    older = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    newer = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    store.upsert_many(
        [
            _article("Older", url="https://example.com/older", published_at=older),
            _article("Newer", url="https://example.com/newer", published_at=newer),
        ]
    )

    result = store.list_articles(category="all", window_days=7, limit=10)

    assert [article["title"] for article in result.articles] == ["Newer"]
