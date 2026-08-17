from __future__ import annotations

import requests

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


def test_fetch_feed_retries_on_timeout_then_succeeds(monkeypatch):
    calls = {"count": 0}

    def fake_get(*_args, **_kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise requests.Timeout("boom")
        return type("Resp", (), {"status_code": 200, "content": b"<rss></rss>"})()

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr("tradingagents.dataflows.providers.rss_news.time.sleep", lambda _s: None)

    provider = RSSContextProvider()
    status, parsed, attempt = provider._fetch_feed(_FEED, {"vendor_max_retries": 1})

    assert calls["count"] == 2
    assert status == "success"
    assert parsed is not None
    assert attempt["status"] == "success"


def test_fetch_feed_gives_up_after_max_retries(monkeypatch):
    calls = {"count": 0}

    def fake_get(*_args, **_kwargs):
        calls["count"] += 1
        raise requests.Timeout("boom")

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr("tradingagents.dataflows.providers.rss_news.time.sleep", lambda _s: None)

    provider = RSSContextProvider()
    status, parsed, _attempt = provider._fetch_feed(_FEED, {"vendor_max_retries": 1})

    assert calls["count"] == 2  # initial attempt + 1 retry, then give up
    assert status == "timeout"
    assert parsed is None


def test_overall_status_success_with_zero_matches_is_not_unavailable():
    assert _overall_status({"success", "timeout"}) == "success"
    assert _overall_status({"timeout"}) == "timeout"
    assert _overall_status(set()) == "unavailable"
