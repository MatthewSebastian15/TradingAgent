from __future__ import annotations

from tradingagents.dataflows.news import news_service
from tradingagents.dataflows.providers.config import set_config


class _DictCache:
    def __init__(self):
        self.store: dict = {}
        self.sets = 0

    def get(self, key):
        return self.store.get(key)

    def set(self, key, value):
        self.sets += 1
        self.store[key] = value


def _service(monkeypatch, cache: _DictCache) -> news_service.NewsService:
    set_config({})
    monkeypatch.setattr(news_service, "_active_cache", lambda config: cache)
    monkeypatch.setattr(news_service, "_fetch_yfinance_fallback", lambda profile, limit: [])
    return news_service.NewsService(
        config={
            "enabled_providers": [],
            "provider_priority": [],
            "enable_yfinance_fallback": False,
            "rss_enabled": False,
        }
    )


def test_prefer_fresh_skips_cache_and_falls_back_when_fresh_is_empty(monkeypatch):
    cache = _DictCache()
    service = _service(monkeypatch, cache)
    service.fetch_news("AAPL", as_of_date="2026-09-14", window_days=7)  # seed key shape
    key = next(iter(cache.store))
    cache.store[key] = {"articles_found": 3, "articles": [{"title": "cached"}], "cache": {}}
    sets_before = cache.sets

    result = service.fetch_news("AAPL", as_of_date="2026-09-14", window_days=7, prefer_fresh=True)

    assert result["articles_found"] == 3
    assert result["cache"]["stale_fallback"] is True
    assert cache.sets == sets_before
    assert any("cached news" in item for item in result["limitations"])


def test_without_prefer_fresh_cache_hit_is_returned(monkeypatch):
    cache = _DictCache()
    service = _service(monkeypatch, cache)
    service.fetch_news("AAPL", as_of_date="2026-09-14", window_days=7)
    key = next(iter(cache.store))
    cache.store[key] = {"articles_found": 3, "cache": {}}

    result = service.fetch_news("AAPL", as_of_date="2026-09-14", window_days=7)

    assert result["cache"]["hit"] is True
    assert result["articles_found"] == 3
