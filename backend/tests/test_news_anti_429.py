from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from owner_session import issue_owner_session
from routes.news import include_news_routes
from services.news_article_store import NewsArticleStore
from services.news_background_worker import reset_news_worker_state_for_tests


def _config(tmp_path):
    return {
        "general_news": {
            "enabled": True,
            "cache_db_path": str(tmp_path / "general_news.sqlite3"),
            "max_stored_articles": 2000,
            "article_retention_days": 30,
            "default_window_days": 7,
            "max_articles_for_ui": 100,
            "ui_default_limit": 100,
            "provider_priority": ["rss_context", "marketaux"],
            "enabled_providers": ["rss_context", "marketaux"],
            "cache_ttl_seconds": 300,
            "stale_ttl_seconds": 3600,
            "background_refresh_seconds": 300,
            "manual_refresh_cooldown_seconds": 90,
        }
    }


def _client(tmp_path, monkeypatch) -> TestClient:
    reset_news_worker_state_for_tests()
    config = _config(tmp_path)
    monkeypatch.setattr("routes.news.build_tradingagents_config", lambda: config)
    monkeypatch.setattr(
        "services.news_background_worker.build_tradingagents_config", lambda: config
    )
    app = FastAPI()
    include_news_routes(app, prefix="/api", is_development=True)
    return TestClient(app, headers={"x-owner-token": issue_owner_session()["owner_token"]})


def _seed_article(tmp_path, *, updated_at: str | None = None):
    config = _config(tmp_path)
    store = NewsArticleStore(db_path=config["general_news"]["cache_db_path"])
    store.upsert_many(
        [
            {
                "id": "rss_context:1",
                "title": "Cached market article",
                "description": "Cached market article",
                "url": "https://example.com/cached",
                "source": "Example",
                "source_domain": "example.com",
                "provider": "rss_context",
                "category": "markets",
                "published_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
        ]
    )
    if updated_at:
        import sqlite3

        with sqlite3.connect(config["general_news"]["cache_db_path"]) as conn:
            conn.execute("UPDATE news_articles SET updated_at = ?", (updated_at,))


def test_get_general_news_reads_article_store_without_force_refresh(tmp_path, monkeypatch):
    _seed_article(tmp_path)
    client = _client(tmp_path, monkeypatch)

    response = client.get("/api/news/general?category=all&window_days=7&limit=100")

    assert response.status_code == 200
    payload = response.json()
    assert payload["articles"][0]["title"] == "Cached market article"
    assert payload["cache"]["hit"] is True
    assert payload["refresh"]["queued"] is False


def test_get_general_news_ignores_legacy_force_refresh_and_queues(tmp_path, monkeypatch):
    _seed_article(tmp_path)
    client = _client(tmp_path, monkeypatch)

    response = client.get("/api/news/general?force_refresh=true")

    assert response.status_code == 200
    payload = response.json()
    assert payload["articles"][0]["title"] == "Cached market article"
    assert payload["refresh"]["reason"] in {"legacy_force_refresh", "refresh_inflight"}


def test_get_general_news_returns_stale_cache_and_queues_refresh(tmp_path, monkeypatch):
    old_updated_at = (datetime.now(timezone.utc) - timedelta(seconds=600)).isoformat().replace(
        "+00:00", "Z"
    )
    _seed_article(tmp_path, updated_at=old_updated_at)
    client = _client(tmp_path, monkeypatch)

    response = client.get("/api/news/general")

    assert response.status_code == 200
    payload = response.json()
    assert payload["cache"]["stale"] is True
    assert payload["articles"][0]["title"] == "Cached market article"
    assert payload["refresh"]["reason"] in {"cache_stale", "refresh_inflight"}


def test_post_refresh_queues_once_then_uses_cooldown(tmp_path, monkeypatch):
    _seed_article(tmp_path)
    client = _client(tmp_path, monkeypatch)

    first = client.post("/api/news/general/refresh")
    second = client.post("/api/news/general/refresh")

    assert first.status_code == 200
    assert first.json()["refresh"]["reason"] in {"manual_refresh", "refresh_inflight"}
    assert second.status_code == 200
    assert second.json()["refresh"]["reason"] == "manual_refresh_cooldown"
