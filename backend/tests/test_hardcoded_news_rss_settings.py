from __future__ import annotations

import importlib


_ENV_OVERRIDES = {
    "NEWS_RSS_ENABLED": "false",
    "NEWS_RSS_MAX_FEEDS": "1",
    "NEWS_RSS_MAX_ITEMS_PER_FEED": "1",
    "NEWS_RSS_INCLUDE_TRIAL_FEEDS": "false",
    "NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED": "false",
    "NEWS_RSS_ENABLED_FEED_IDS": "only-this-feed",
    "NEWS_RSS_DISABLED_FEED_IDS": "theblock-trial,cnbc-business",
    "NEWS_RSS_USER_AGENT": "BadAgent/0.0",
    "NEWS_CACHE_DB_PATH": "/tmp/bad-news.sqlite3",
    "GENERAL_NEWS_RSS_PRIMARY": "false",
    "GENERAL_NEWS_RSS_MAX_FEEDS": "1",
    "GENERAL_NEWS_RSS_MAX_ITEMS_PER_FEED": "1",
    "GENERAL_NEWS_ALLOWED_CATEGORIES": "all,indonesia",
    "GENERAL_NEWS_CACHE_DB_PATH": "/tmp/bad-general-news.sqlite3",
}


def test_backend_news_rss_settings_are_hardcoded(monkeypatch):
    for key, value in _ENV_OVERRIDES.items():
        monkeypatch.setenv(key, value)

    import config_defaults

    config_defaults = importlib.reload(config_defaults)

    assert config_defaults.NEWS_RSS_ENABLED is True
    assert config_defaults.NEWS_RSS_MAX_FEEDS == 50
    assert config_defaults.NEWS_RSS_MAX_ITEMS_PER_FEED == 20
    assert config_defaults.NEWS_RSS_INCLUDE_TRIAL_FEEDS is True
    assert config_defaults.NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED is True
    assert config_defaults.NEWS_RSS_ENABLED_FEED_IDS == ""
    assert config_defaults.NEWS_RSS_DISABLED_FEED_IDS == []
    assert config_defaults.NEWS_RSS_USER_AGENT == "TradingAgent/0.1 RSS Reader"
    assert config_defaults.NEWS_CACHE_DB_PATH == ".cache/news_data.sqlite3"
    assert config_defaults.GENERAL_NEWS_RSS_PRIMARY is True
    assert config_defaults.GENERAL_NEWS_RSS_MAX_FEEDS == 50
    assert config_defaults.GENERAL_NEWS_RSS_MAX_ITEMS_PER_FEED == 30
    assert config_defaults.GENERAL_NEWS_ALLOWED_CATEGORIES == [
        "all",
        "markets",
        "world",
        "finance",
        "tech",
        "macro",
        "central_bank",
        "regulatory",
        "forex",
        "crypto",
    ]
    assert config_defaults.GENERAL_NEWS_CACHE_DB_PATH == ".cache/general_news.sqlite3"


def test_core_news_rss_settings_are_hardcoded(monkeypatch):
    for key, value in _ENV_OVERRIDES.items():
        monkeypatch.setenv(key, value)

    import tradingagents.default_config as default_config

    default_config = importlib.reload(default_config)

    news = default_config.DEFAULT_CONFIG["news"]
    general_news = default_config.DEFAULT_CONFIG["general_news"]

    assert news["rss_enabled"] is True
    assert news["rss_max_feeds"] == 50
    assert news["rss_max_items_per_feed"] == 20
    assert news["rss_include_trial_feeds"] is True
    assert news["rss_google_news_fallback_enabled"] is True
    assert news["rss_enabled_feed_ids"] == ""
    assert news["rss_disabled_feed_ids"] == ""
    assert news["rss_user_agent"] == "TradingAgent/0.1 RSS Reader"
    assert news["cache_db_path"] == ".cache/news_data.sqlite3"
    assert general_news["rss_primary"] is True
    assert general_news["rss_max_feeds"] == 50
    assert general_news["rss_max_items_per_feed"] == 30
    assert general_news["allowed_categories"] == "all,markets,world,finance,tech,macro,central_bank,regulatory,forex,crypto"
    assert general_news["cache_db_path"] == ".cache/general_news.sqlite3"
