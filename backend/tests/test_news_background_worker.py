from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest
from tradingagents.dataflows.news.general_news_service import GeneralNewsService

from services import news_background_worker as worker
from services.news_article_store import NewsArticleStore
from services.news_background_worker import (
    get_worker_health,
    manual_refresh_cooldown_remaining,
    mark_manual_refresh_requested,
    refresh_general_news_background,
    reset_news_worker_state_for_tests,
)
from services.news_inflight_dedupe import clear_inflight_for_tests


@pytest.fixture(autouse=True)
def _reset_worker_state():
    reset_news_worker_state_for_tests()
    clear_inflight_for_tests()
    yield
    reset_news_worker_state_for_tests()
    clear_inflight_for_tests()


def _config(tmp_path):
    return {
        "general_news": {
            "enabled": True,
            "cache_db_path": str(tmp_path / "general_news.sqlite3"),
            "max_stored_articles": 2000,
            "article_retention_days": 30,
            "default_window_days": 7,
            "max_articles_for_ui": 100,
            "provider_priority": ["rss_context"],
            "enabled_providers": ["rss_context"],
            "cache_ttl_seconds": 300,
            "stale_ttl_seconds": 3600,
            "manual_refresh_cooldown_seconds": 90,
        }
    }


def _article():
    return {
        "id": "rss_context:1",
        "title": "Stocks gain after earnings",
        "description": "Stocks gain after earnings",
        "url": "https://example.com/stocks",
        "source": "Example",
        "source_domain": "example.com",
        "provider": "rss_context",
        "category": "markets",
        "published_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


@pytest.mark.asyncio
async def test_background_refresh_stores_articles(tmp_path, monkeypatch):
    config = _config(tmp_path)
    monkeypatch.setattr(
        "services.news_background_worker.build_tradingagents_config", lambda: config
    )
    monkeypatch.setattr(
        GeneralNewsService,
        "fetch_general_news",
        lambda self, **kwargs: {
            "articles": [_article()],
            "last_updated": "2026-06-20T10:00:00Z",
            "refresh": {},
        },
    )

    result = await refresh_general_news_background(reason="scheduled")
    stored = NewsArticleStore(db_path=config["general_news"]["cache_db_path"]).list_articles(
        category="all", window_days=7, limit=10
    )

    assert result["refresh"]["stored_articles"] == 1
    assert stored.articles[0]["title"] == "Stocks gain after earnings"


def test_manual_refresh_cooldown_tracks_recent_refresh(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "services.news_background_worker.build_tradingagents_config",
        lambda: _config(tmp_path),
    )

    assert manual_refresh_cooldown_remaining() == 0
    mark_manual_refresh_requested()

    assert manual_refresh_cooldown_remaining() > 0


@pytest.mark.asyncio
async def test_worker_loop_tracks_consecutive_failures_then_recovers(monkeypatch):
    monkeypatch.setattr(worker, "_general_news_config", lambda: {"background_refresh_seconds": 30})

    calls = {"n": 0}

    async def fake_refresh(reason="scheduled"):
        calls["n"] += 1
        if calls["n"] <= 3:
            raise RuntimeError(f"boom-{calls['n']}")
        return {}

    sleeps = {"n": 0}

    async def fake_sleep(_seconds):
        sleeps["n"] += 1
        if sleeps["n"] >= 4:
            raise asyncio.CancelledError

    monkeypatch.setattr(worker, "refresh_general_news_background", fake_refresh)
    monkeypatch.setattr(worker.asyncio, "sleep", fake_sleep)

    assert get_worker_health()["consecutive_failures"] == 0

    with pytest.raises(asyncio.CancelledError):
        await worker.news_worker_loop()

    health = get_worker_health()
    assert calls["n"] == 4
    # 3rd failure trips the warning threshold, 4th cycle succeeds and resets it.
    assert health["consecutive_failures"] == 0
    assert health["degraded"] is False
    assert health["last_success_at"] is not None
    assert health["last_failure_at"] is not None
    assert health["last_failure_error"] == "boom-3"


class _Feed:
    def __init__(self, feed_id: str) -> None:
        self.id = feed_id


def test_feed_rotation_returns_different_batches_per_cycle():
    from services.news_feed_rotation import FeedRotationState

    state = FeedRotationState()
    feeds = [_Feed("a"), _Feed("b"), _Feed("c"), _Feed("d")]

    assert state.next_batch(feeds, 2) == [feeds[0], feeds[1]]
    assert state.next_batch(feeds, 2) == [feeds[2], feeds[3]]
    assert state.next_batch(feeds, 2) == [feeds[0], feeds[1]]


def test_feed_rotation_wraps_partial_batch():
    from services.news_feed_rotation import FeedRotationState

    state = FeedRotationState()
    feeds = [_Feed("a"), _Feed("b"), _Feed("c")]

    assert state.next_batch(feeds, 2) == [feeds[0], feeds[1]]
    assert state.next_batch(feeds, 2) == [feeds[2], feeds[0]]
