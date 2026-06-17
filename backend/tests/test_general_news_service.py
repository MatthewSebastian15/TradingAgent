from __future__ import annotations

import inspect
import sqlite3
from datetime import datetime, timedelta, timezone

from tradingagents.dataflows import general_news_service
from tradingagents.dataflows.general_news_service import GeneralNewsService
from tradingagents.dataflows.news_models import NormalizedNewsArticle
from tradingagents.dataflows.news_provider_base import ProviderFetchResult


def _config(tmp_path, **overrides):
    config = {
        "enabled": True,
        "provider_priority": "rss_context",
        "enabled_providers": "rss_context",
        "enable_background_refresh": False,
        "refresh_interval_seconds": 120,
        "cache_ttl_seconds": 120,
        "default_window_days": 7,
        "default_limit": 50,
        "max_articles_for_ui": 100,
        "max_articles_per_provider": 30,
        "cache_enabled": True,
        "cache_db_path": str(tmp_path / "general_news.sqlite3"),
        "cache_max_entries": 100,
        "rss_primary": True,
    }
    config.update(overrides)
    return config


def _article(title, *, url=None, source="Bloomberg", published_at=None, summary=None):
    return NormalizedNewsArticle(
        provider="rss_context",
        provider_article_id=url or title,
        ticker="GENERAL",
        company_name="Global Markets",
        title=title,
        summary=summary or title,
        url=url or f"https://example.com/{title.lower().replace(' ', '-')}",
        source=source,
        source_domain="example.com",
        published_at=published_at or datetime.now(timezone.utc),
        market_context_only=True,
    )


def _patch_rss(monkeypatch, articles, status="success"):
    def fetch(self, **_kwargs):
        return ProviderFetchResult(provider="rss_context", status=status, articles=list(articles))

    monkeypatch.setattr(GeneralNewsService, "_fetch_rss_context", fetch)


def test_service_returns_enabled_false_when_config_disabled(tmp_path):
    result = GeneralNewsService(_config(tmp_path, enabled=False)).fetch_general_news()

    assert result["enabled"] is False
    assert result["articles"] == []


def test_service_accepts_category_all(tmp_path, monkeypatch):
    _patch_rss(monkeypatch, [_article("Stocks gain after earnings")])

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(category="all", force_refresh=True)

    assert result["category"] == "all"
    assert result["articles_found"] == 1


def test_invalid_category_falls_back_to_all(tmp_path, monkeypatch):
    _patch_rss(monkeypatch, [_article("Stocks gain after earnings")])

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(category="bad", force_refresh=True)

    assert result["category"] == "all"


def test_provider_failure_does_not_crash(tmp_path, monkeypatch):
    _patch_rss(monkeypatch, [], status="timeout")

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(force_refresh=True)

    assert result["provider_status"]["rss_context"] == "timeout"
    assert result["articles"] == []
    assert result["warning"] == "No general news available."


def test_all_provider_failure_returns_stale_cache_when_available(tmp_path, monkeypatch):
    cache_path = tmp_path / "general_news.sqlite3"
    _patch_rss(monkeypatch, [_article("Cached market article")])
    service = GeneralNewsService(_config(tmp_path, cache_db_path=str(cache_path)))
    service.fetch_general_news()
    with sqlite3.connect(cache_path) as conn:
        conn.execute("UPDATE general_news_cache SET expires_at = 0")
    _patch_rss(monkeypatch, [], status="timeout")

    result = service.fetch_general_news()

    assert result["warning"] == "Serving stale cached general news because all providers failed."
    assert result["cache"]["stale"] is True
    assert result["articles"][0]["title"] == "Cached market article"


def test_dedup_removes_duplicate_url(tmp_path, monkeypatch):
    url = "https://example.com/same"
    _patch_rss(
        monkeypatch,
        [
            _article("Stocks gain after earnings", url=url),
            _article("Stocks gain after earnings update", url=url),
        ],
    )

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(force_refresh=True)

    assert result["articles_found"] == 1


def test_category_filter_returns_only_selected_category(tmp_path, monkeypatch):
    _patch_rss(
        monkeypatch,
        [
            _article("Bitcoin rises after ETF inflows", source="CoinDesk"),
            _article("Stocks gain after earnings", source="Bloomberg"),
        ],
    )

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(category="crypto", force_refresh=True)

    assert result["articles"]
    assert {article["category"] for article in result["articles"]} == {"crypto"}


def test_articles_sorted_by_published_at_desc(tmp_path, monkeypatch):
    now = datetime.now(timezone.utc)
    _patch_rss(
        monkeypatch,
        [
            _article("Older market news", published_at=now - timedelta(days=2)),
            _article("Newer market news", published_at=now),
        ],
    )

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(force_refresh=True)

    assert [article["title"] for article in result["articles"]] == ["Newer market news", "Older market news"]


def test_limit_is_applied(tmp_path, monkeypatch):
    _patch_rss(
        monkeypatch,
        [
            _article("Stocks gain after earnings"),
            _article("Oil prices rise on supply outlook"),
            _article("Treasury yields move lower"),
        ],
    )

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(limit=2, force_refresh=True)

    assert result["articles_found"] == 2


def test_cache_hit_returns_cached_response(tmp_path, monkeypatch):
    _patch_rss(monkeypatch, [_article("Cached market article")])
    service = GeneralNewsService(_config(tmp_path))

    first = service.fetch_general_news()
    second = service.fetch_general_news()

    assert first["cache"]["hit"] is False
    assert second["cache"]["hit"] is True
    assert second["articles"][0]["title"] == "Cached market article"


def test_force_refresh_bypasses_cache(tmp_path, monkeypatch):
    _patch_rss(monkeypatch, [_article("First market article")])
    service = GeneralNewsService(_config(tmp_path))
    service.fetch_general_news()
    _patch_rss(monkeypatch, [_article("Second market article")])

    result = service.fetch_general_news(force_refresh=True)

    assert result["cache"]["hit"] is False
    assert result["articles"][0]["title"] == "Second market article"


def test_service_imports_shared_rss_context_provider():
    assert general_news_service.RSSContextProvider.__module__.endswith(".rss_news")


def test_service_does_not_import_ticker_news_service():
    source = inspect.getsource(general_news_service)

    assert "from .news_service import" not in source


def test_yfinance_is_not_called_for_general_news():
    source = inspect.getsource(general_news_service).lower()

    assert "yfinance" not in source


def test_article_description_is_capped_at_35_words(tmp_path, monkeypatch):
    long_summary = " ".join(f"word{index}" for index in range(1, 50))
    _patch_rss(monkeypatch, [_article("Stocks gain after earnings", summary=long_summary)])

    result = GeneralNewsService(_config(tmp_path)).fetch_general_news(force_refresh=True)

    assert len(result["articles"][0]["description"].split()) == 35
    assert len(result["articles"][0]["summary"].split()) == 35


def test_general_rss_fetch_uses_all_configured_feed_capacity(tmp_path, monkeypatch):
    captured = {}

    class FakeRSSProvider:
        def __init__(self, *_args, **_kwargs):
            pass

        def fetch_news(self, *_args, **kwargs):
            captured.update(kwargs)
            return ProviderFetchResult(provider="rss_context", status="success", articles=[])

    monkeypatch.setattr(general_news_service, "RSSContextProvider", FakeRSSProvider)

    GeneralNewsService(
        _config(
            tmp_path,
            rss_max_feeds=8,
            rss_max_items_per_feed=5,
            cache_enabled=False,
        )
    ).fetch_general_news(force_refresh=True)

    assert captured["limit"] == 40

def test_published_age_uses_minutes_hours_days_and_weeks():
    now = datetime.now(timezone.utc)

    assert general_news_service._published_age(now - timedelta(minutes=1)) == "1m"
    assert general_news_service._published_age(now - timedelta(hours=23)) == "23h"
    assert general_news_service._published_age(now - timedelta(days=1)) == "1 Day"
    assert general_news_service._published_age(now - timedelta(days=6)) == "6 Days"
    assert general_news_service._published_age(now - timedelta(days=14)) == "2 W"
