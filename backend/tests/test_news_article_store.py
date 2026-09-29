from __future__ import annotations

from datetime import datetime, timedelta, timezone

from services.news.article_store import NewsArticleStore, build_content_hash, normalize_title


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


def test_upsert_writes_last_updated_into_store_meta(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"))

    store.upsert_many([_article("First", url="https://example.com/1")])
    with store._connect() as conn:
        first_value = conn.execute(
            "SELECT value FROM store_meta WHERE key = 'last_updated'"
        ).fetchone()[0]
    assert first_value is not None

    store.upsert_many([_article("Second", url="https://example.com/2")])
    with store._connect() as conn:
        second_value = conn.execute(
            "SELECT value FROM store_meta WHERE key = 'last_updated'"
        ).fetchone()[0]
    assert second_value >= first_value


def test_last_updated_is_global_even_when_category_filter_matches_nothing(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"))
    store.upsert_many([_article("Only markets story", url="https://example.com/1")])

    result = store.list_articles(category="crypto", window_days=7, limit=10)

    assert result.articles == []
    assert result.total_available == 0
    assert result.last_updated is not None

    with store._connect() as conn:
        meta_value = conn.execute(
            "SELECT value FROM store_meta WHERE key = 'last_updated'"
        ).fetchone()[0]
    assert result.last_updated == meta_value


def test_row_without_published_at_backfills_from_created_at(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"))
    article = _article("No date supplied", url="https://example.com/no-date")
    article["published_at"] = None

    store.upsert_many([article])

    with store._connect() as conn:
        row = conn.execute(
            "SELECT published_at, created_at FROM news_articles WHERE title = 'No date supplied'"
        ).fetchone()
    assert row[0] is not None
    assert row[0] == row[1]


def test_ensure_schema_backfills_legacy_null_published_at_rows(tmp_path):
    db_path = tmp_path / "news.sqlite3"
    store = NewsArticleStore(db_path=str(db_path))
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO news_articles (
                id, title, description, url, canonical_url, source, source_domain,
                provider, category, published_at, tickers_json, sentiment, impact,
                content_hash, article_json, created_at, updated_at
            ) VALUES (
                'legacy:1', 'Legacy row', 'desc', 'https://example.com/legacy',
                'https://example.com/legacy', 'Example', 'example.com', 'rss_context',
                'markets', NULL, '[]', NULL, NULL,
                'legacyhash', '{"title": "Legacy row"}',
                '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            )
            """
        )
        conn.commit()

    NewsArticleStore(db_path=str(db_path))

    with store._connect() as conn:
        row = conn.execute(
            "SELECT published_at, created_at FROM news_articles WHERE content_hash = 'legacyhash'"
        ).fetchone()
    assert row[0] == row[1] == "2026-01-01T00:00:00Z"


def test_list_articles_query_plan_uses_category_published_index(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"))
    older_date = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat().replace("+00:00", "Z")
    newer_date = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    store.upsert_many(
        [
            _article("Older", url="https://example.com/older", published_at=older_date),
            _article("Newer", url="https://example.com/newer", published_at=newer_date),
        ]
    )

    result = store.list_articles(category="markets", window_days=7, limit=10)
    assert [a["title"] for a in result.articles] == ["Newer", "Older"]

    with store._connect() as conn:
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=7)
        cutoff_text = cutoff_dt.isoformat().replace("+00:00", "Z")
        plan_rows = conn.execute(
            """
            EXPLAIN QUERY PLAN
            SELECT article_json, updated_at FROM news_articles
            WHERE published_at >= ? AND category = ?
            ORDER BY published_at DESC, updated_at DESC
            LIMIT ?
            """,
            (cutoff_text, "markets", 10),
        ).fetchall()
    plan_text = " ".join(str(step) for step in plan_rows)
    assert "idx_news_articles_category_published" in plan_text


def test_store_reuses_a_single_connection_across_calls(tmp_path):
    store = NewsArticleStore(db_path=str(tmp_path / "news.sqlite3"))

    store.upsert_many([_article("First", url="https://example.com/1")])
    conn_after_write = store._conn

    store.list_articles(category="all", window_days=7, limit=10)
    conn_after_read = store._conn

    assert conn_after_write is not None
    assert conn_after_write is conn_after_read


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
