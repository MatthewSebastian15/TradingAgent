from __future__ import annotations

from types import SimpleNamespace

from tradingagents.dataflows import rss_news
from tradingagents.dataflows.rss_news import RSSContextProvider, _select_feeds
from tradingagents.dataflows.rss_news_config import (
    DEFAULT_RSS_FEEDS,
    GOOGLE_NEWS_FALLBACK_RSS_FEEDS,
    RSSFeedConfig,
)

ALLOWED_RSS_CATEGORIES = {
    "markets",
    "world",
    "finance",
    "tech",
    "macro",
    "central_bank",
    "regulatory",
    "forex",
    "crypto",
}

EXISTING_FEED_IDS = {
    "cnbc-business",
    "bbc-business",
    "coindesk",
    "sec-news",
    "fxstreet-news",
    "investing-news",
    "oilprice-main",
    "theblock-trial",
}

NEW_FEED_IDS = {
    "federal-reserve-press",
    "bank-of-england-news",
    "wsj-markets",
    "wsj-world",
    "cnbc-finance",
    "cnbc-world",
    "cnbc-tech",
    "bbc-world",
    "marketwatch-marketpulse",
    "seeking-alpha-news",
    "cointelegraph-news",
    "wolf-street",
}


def _feed_map():
    return {feed.id: feed for feed in DEFAULT_RSS_FEEDS}


def test_existing_and_new_rss_feeds_are_present_and_enabled():
    feeds = _feed_map()

    assert EXISTING_FEED_IDS <= set(feeds)
    assert NEW_FEED_IDS <= set(feeds)
    assert all(feed.enabled for feed in DEFAULT_RSS_FEEDS)
    assert feeds["theblock-trial"].enabled is True
    assert feeds["theblock-trial"].tier == 2
    assert feeds["sec-news"].name == "SEC Press Releases"


def test_default_rss_feed_categories_use_allowed_keys():
    assert {feed.category for feed in DEFAULT_RSS_FEEDS} <= ALLOWED_RSS_CATEGORIES


def test_bloomberg_google_fallback_exists_once_and_is_enabled():
    bloomberg = [feed for feed in GOOGLE_NEWS_FALLBACK_RSS_FEEDS if feed.source == "BLOOMBERG"]

    assert len(bloomberg) == 1
    assert bloomberg[0].id == "bloomberg-markets-google-news"
    assert bloomberg[0].enabled is True
    assert bloomberg[0].is_google_news_fallback is True
    assert bloomberg[0].tier == 3
    assert "commodities" in bloomberg[0].url.lower()


def test_select_feeds_empty_disabled_list_does_not_inject_theblock():
    selected = _select_feeds(
        {
            "rss_google_news_fallback_enabled": False,
            "rss_disabled_feed_ids": "",
            "rss_max_feeds": 50,
        },
        None,
    )

    assert any(feed.id == "theblock-trial" for feed in selected)


def test_select_feeds_keeps_enabled_allowlist_and_disabled_blocklist():
    selected = _select_feeds(
        {
            "rss_google_news_fallback_enabled": False,
            "rss_enabled_feed_ids": "theblock-trial,cnbc-business",
            "rss_disabled_feed_ids": "cnbc-business",
            "rss_max_feeds": 50,
        },
        None,
    )

    assert [feed.id for feed in selected] == ["theblock-trial"]


def test_company_google_news_fallback_feeds_remain_active():
    selected = _select_feeds(
        {
            "rss_google_news_fallback_enabled": True,
            "rss_disabled_feed_ids": "",
            "rss_max_feeds": 50,
        },
        {
            "ticker": "AAPL",
            "short_ticker": "AAPL",
            "company_name": "Apple",
            "aliases": ["Apple Inc"],
        },
    )

    company_ids = {feed.id for feed in selected if feed.id.startswith("company-google-news-")}
    assert company_ids == {f"company-google-news-{index}" for index in range(1, 9)}


def test_failed_feed_does_not_fail_successful_feed_batch(monkeypatch):
    feeds = [
        RSSFeedConfig(
            id="bad-feed",
            name="Bad Feed",
            url="https://bad.example/rss",
            category="markets",
            region="global",
            source="BAD",
        ),
        RSSFeedConfig(
            id="good-feed",
            name="Good Feed",
            url="https://good.example/rss",
            category="markets",
            region="global",
            source="GOOD",
        ),
    ]

    monkeypatch.setattr(rss_news, "feedparser", object())
    monkeypatch.setattr(rss_news, "_select_feeds", lambda *_args, **_kwargs: feeds)

    def fake_fetch(_self, feed, _config):
        if feed.id == "bad-feed":
            return "timeout", None, {"strategy": feed.id, "status": "timeout"}
        parsed = SimpleNamespace(
            entries=[
                {
                    "title": "Global markets rally",
                    "link": "https://good.example/story",
                    "summary": "Stocks rise after earnings.",
                    "published": "Mon, 15 Jun 2026 12:00:00 GMT",
                }
            ]
        )
        return "success", parsed, {"strategy": feed.id, "status": "success"}

    monkeypatch.setattr(RSSContextProvider, "_fetch_feed", fake_fetch)

    result = RSSContextProvider(config={"rss_enabled": True}).fetch_news(
        {"ticker": "GENERAL", "company_name": "Global Markets"},
        limit=10,
    )

    assert result.status == "success"
    assert len(result.articles) == 1
    assert {attempt["status"] for attempt in result.attempts} == {"timeout", "success"}
