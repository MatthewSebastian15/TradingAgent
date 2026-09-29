from __future__ import annotations

import pytest
import requests

from tradingagents.dataflows.providers import rss_news
from tradingagents.dataflows.providers.rss_news import RSSContextProvider, _overall_status
from tradingagents.dataflows.providers.rss_news_config import RSSFeedConfig

_FEED = RSSFeedConfig(
    id="test-feed",
    name="Test Feed",
    url="https://example.com/rss.xml",
    category="finance",
    region="global",
    source="Test",
)


@pytest.fixture(autouse=True)
def feed_failures(monkeypatch):
    """Isolate the per-feed circuit breaker and skip retry sleeps; returns recorded failures."""
    failures: list[tuple[str, str, int | None]] = []

    def record_failure(feed_id, error, *, cooldown_seconds=None):
        failures.append((feed_id, error, cooldown_seconds))

    monkeypatch.setattr(rss_news, "_is_feed_available", lambda _feed_id: True)
    monkeypatch.setattr(rss_news, "_mark_feed_failure", record_failure)
    monkeypatch.setattr(rss_news, "_mark_feed_success", lambda _feed_id: None)
    monkeypatch.setattr(rss_news.time, "sleep", lambda _seconds: None)
    return failures


def test_fetch_feed_does_not_retry_after_a_timeout(monkeypatch, feed_failures):
    calls = {"count": 0}

    def fake_get(*_args, **_kwargs):
        calls["count"] += 1
        raise requests.Timeout("boom")

    monkeypatch.setattr(requests, "get", fake_get)

    provider = RSSContextProvider()
    status, parsed, attempt = provider._fetch_feed(_FEED, {"vendor_max_retries": 1})

    assert calls["count"] == 1  # no retry on timeout, even though vendor_max_retries=1
    assert status == "timeout"
    assert parsed is None
    assert attempt["status"] == "timeout"
    # The feed goes on cooldown right after that single request.
    assert feed_failures == [("test-feed", "timeout", 600)]


def test_fetch_feed_still_retries_on_a_5xx_response(monkeypatch, feed_failures):
    calls = {"count": 0}

    def fake_get(*_args, **_kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            return type("Resp", (), {"status_code": 503, "content": b""})()
        return type("Resp", (), {"status_code": 200, "content": b"<rss></rss>"})()

    monkeypatch.setattr(requests, "get", fake_get)

    provider = RSSContextProvider()
    status, parsed, attempt = provider._fetch_feed(_FEED, {"vendor_max_retries": 1})

    assert calls["count"] == 2  # the 5xx retry is unchanged
    assert status == "success"
    assert parsed is not None
    assert attempt["status"] == "success"
    assert feed_failures == []


def test_overall_status_success_with_zero_matches_is_not_unavailable():
    assert _overall_status({"success", "timeout"}) == "success"
    assert _overall_status({"timeout"}) == "timeout"
    assert _overall_status(set()) == "unavailable"
