from __future__ import annotations

import requests
from tradingagents.dataflows.providers.rss_news import RSSContextProvider
from tradingagents.dataflows.providers.rss_news_config import RSSFeedConfig

from services.news_provider_budget import clear_provider_budget_for_tests

_FEED = RSSFeedConfig(
    id="breaker-test-feed",
    name="Breaker Test Feed",
    url="https://example.com/rss.xml",
    category="finance",
    region="global",
    source="Test",
)
_CONFIG = {"vendor_max_retries": 1, "rss_feed_failure_cooldown_seconds": 600}


def setup_function():
    clear_provider_budget_for_tests()


def teardown_function():
    clear_provider_budget_for_tests()


def test_feed_trips_breaker_after_exhausted_retries_and_is_skipped_next_call(monkeypatch):
    call_count = {"n": 0}

    def always_timeout(*_args, **_kwargs):
        call_count["n"] += 1
        raise requests.Timeout("boom")

    monkeypatch.setattr(requests, "get", always_timeout)
    monkeypatch.setattr("tradingagents.dataflows.providers.rss_news.time.sleep", lambda _s: None)

    provider = RSSContextProvider()

    status, parsed, _attempt = provider._fetch_feed(_FEED, _CONFIG)
    assert status == "timeout"
    assert parsed is None
    assert call_count["n"] == 2  # initial attempt + 1 retry, both exhausted

    # Breaker tripped: the next call must skip the network entirely.
    status2, parsed2, attempt2 = provider._fetch_feed(_FEED, _CONFIG)
    assert status2 == "skipped_cooldown"
    assert parsed2 is None
    assert attempt2["status"] == "skipped_cooldown"
    assert call_count["n"] == 2  # unchanged - no new HTTP attempt


def test_feed_recovers_after_success(monkeypatch):
    def ok(*_args, **_kwargs):
        return type("Resp", (), {"status_code": 200, "content": b"<rss></rss>"})()

    monkeypatch.setattr(requests, "get", ok)

    provider = RSSContextProvider()

    status, parsed, _attempt = provider._fetch_feed(_FEED, _CONFIG)
    assert status == "success"
    assert parsed is not None

    # Success never sets a cooldown, so a follow-up call still hits the network.
    status2, parsed2, _attempt2 = provider._fetch_feed(_FEED, _CONFIG)
    assert status2 == "success"
    assert parsed2 is not None
