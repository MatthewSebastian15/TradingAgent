from __future__ import annotations

from typing import Any

from tradingagents.dataflows.google_news_light import GoogleNewsLightProvider
from tradingagents.dataflows.marketaux_news import MarketAuxProvider
from tradingagents.dataflows.news_models import NewsEntity, NormalizedNewsArticle
from tradingagents.dataflows.news_provider_base import ProviderFetchResult, sanitize_params
from tradingagents.dataflows.news_service import NewsService, _filter_articles_by_window, format_news_for_prompt
from tradingagents.dataflows.news_ticker_aliases import resolve_news_ticker
from tradingagents.dataflows.newsdata_news import NewsDataProvider
from tradingagents.dataflows.rss_news import _select_feeds, build_company_rss_queries, score_rss_article


class FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any]) -> None:
        self.status_code = status_code
        self._payload = payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> dict[str, Any]:
        return self._payload


def test_marketaux_normalizes_entity_news_and_redacts_token(monkeypatch):
    calls: list[dict[str, Any]] = []

    def fake_get(_url, *, params, timeout):
        calls.append({"params": params, "timeout": timeout})
        return FakeResponse(
            200,
            {
                "data": [
                    {
                        "uuid": "marketaux-1",
                        "title": "Bank Central Asia earnings remain resilient",
                        "description": "BBCA loan growth remained stable.",
                        "url": "https://example.com/bbca",
                        "source": "example.com",
                        "published_at": "2026-05-28T09:30:00Z",
                        "entities": [
                            {
                                "symbol": "BBCA.JK",
                                "name": "Bank Central Asia",
                                "match_score": 88.4,
                                "sentiment_score": 0.32,
                            }
                        ],
                    }
                ]
            },
        )

    monkeypatch.setattr("tradingagents.dataflows.news_provider_base.requests.get", fake_get)
    result = MarketAuxProvider("secret-token", max_retries=0).fetch_news(
        resolve_news_ticker("BBCA.JK"),
        as_of_date="2026-06-01",
        include_raw=True,
    )

    assert result.status == "success"
    assert result.articles[0].provider == "marketaux"
    assert result.articles[0].sentiment_label == "positive"
    assert result.articles[0].relevance_score >= 90
    assert calls[0]["params"]["symbols"] == "BBCA.JK"
    assert result.attempts[0]["request_params"]["api_token"] == "***REDACTED***"
    assert "secret-token" not in str(result.attempts)


def test_google_news_light_normalizes_results_and_redacts_key(monkeypatch):
    calls: list[dict[str, Any]] = []

    def fake_get(_url, *, params, timeout):
        calls.append({"params": params, "timeout": timeout})
        return FakeResponse(
            200,
            {
                "organic_results": [
                    {
                        "position": 1,
                        "title": "BBCA earnings support Bank Central Asia saham outlook",
                        "link": "https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fbbca-earnings&sa=U",
                        "source": "Example Finance",
                        "snippet": "Bank Central Asia reported resilient profit growth.",
                        "date": "2 hours ago",
                        "thumbnail": "https://example.com/thumb.jpg",
                    }
                ]
            },
        )

    monkeypatch.setattr("tradingagents.dataflows.news_provider_base.requests.get", fake_get)
    result = GoogleNewsLightProvider("google-news-secret", max_retries=0).fetch_news(
        resolve_news_ticker("BBCA.JK"),
        as_of_date="2026-06-01",
        window_days=7,
        include_raw=True,
    )

    assert result.status == "success"
    assert result.articles[0].provider == "google_news_light"
    assert result.articles[0].url == "https://example.com/bbca-earnings"
    assert result.articles[0].published_at is not None
    assert result.articles[0].relevance_score >= 80
    assert calls[0]["params"]["engine"] == "google_news_light"
    assert calls[0]["params"]["gl"] == "id"
    assert calls[0]["params"]["hl"] == "id"
    assert calls[0]["params"]["time_period"] == "last_week"
    assert "saham" in calls[0]["params"]["q"]
    assert result.attempts[0]["request_params"]["api_key"] == "***REDACTED***"
    assert "google-news-secret" not in str(result.attempts)


def test_google_news_light_missing_api_key_returns_status():
    result = GoogleNewsLightProvider("", max_retries=0).fetch_news(resolve_news_ticker("BBCA.JK"))

    assert result.status == "missing_api_key"
    assert result.articles == []


def test_newsdata_uses_separate_fallback_queries(monkeypatch):
    calls: list[dict[str, Any]] = []

    def fake_get(_url, *, params, timeout):
        calls.append(params)
        if len(calls) == 1:
            return FakeResponse(200, {"results": []})
        return FakeResponse(
            200,
            {
                "results": [
                    {
                        "article_id": "newsdata-1",
                        "title": "Bank Central Asia expands digital banking services",
                        "description": "Bank Central Asia reported steady customer growth.",
                        "link": "https://example.com/newsdata-bbca",
                        "source_name": "example-market",
                        "pubDate": "2026-05-28 08:00:00",
                        "symbol": ["BBCA"],
                    }
                ]
            },
        )

    monkeypatch.setattr("tradingagents.dataflows.news_provider_base.requests.get", fake_get)
    result = NewsDataProvider("newsdata-secret", max_retries=0).fetch_news(resolve_news_ticker("BBCA.JK"))

    assert result.status == "success"
    assert len(result.articles) == 1
    assert calls[0]["symbol"] == "BBCA"
    assert "qInTitle" not in calls[0]
    assert calls[1]["qInTitle"] == "Bank Central Asia"
    assert "q" not in calls[1]


def test_rss_scoring_strong_company_match_reaches_decision_threshold():
    profile = resolve_news_ticker("BBCA.JK")

    score, matched_terms = score_rss_article(
        {
            "title": "Bank Central Asia shares rise after earnings update",
            "summary": "BBCA revenue growth remains resilient.",
        },
        profile,
    )

    assert score >= 80
    assert "bbca" in matched_terms
    assert "bank central asia" in matched_terms


def test_rss_dynamic_company_queries_are_added_before_generic_fallbacks():
    profile = resolve_news_ticker("BBCA.JK")

    queries = build_company_rss_queries(profile)
    feeds = _select_feeds(
        {
            "rss_google_news_fallback_enabled": True,
            "rss_include_trial_feeds": False,
            "rss_disabled_feed_ids": ["theblock-trial"],
            "rss_max_feeds": 10,
        },
        profile,
    )

    assert "BBCA.JK stock" in queries
    assert "BBCA earnings" in queries
    assert "Bank Central Asia stock" in queries
    assert any(feed.id.startswith("company-google-news-") for feed in feeds)
    assert len(feeds) == 10


def test_news_service_skips_secondary_when_primary_is_sufficient(monkeypatch):
    headlines = [
        "BBCA earnings remain resilient",
        "BBCA loan growth supports outlook",
        "BBCA expands digital banking services",
        "BBCA capital ratio remains stable",
        "BBCA fee income improves",
    ]
    primary_articles = [
        NormalizedNewsArticle(
            provider="marketaux",
            provider_article_id=f"article-{index}",
            ticker="BBCA.JK",
            title=headline,
            url=f"https://example.com/{index}",
            relevance_score=90,
        )
        for index, headline in enumerate(headlines)
    ]

    class PrimaryProvider:
        api_key = "configured"

        def fetch_news(self, *_args, **_kwargs):
            return ProviderFetchResult(provider="marketaux", status="success", articles=primary_articles)

    class SecondaryProvider:
        api_key = "configured"

        def fetch_news(self, *_args, **_kwargs):
            raise AssertionError("Secondary provider should be skipped.")

    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.MarketAuxProvider", lambda *_args, **_kwargs: PrimaryProvider()
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.NewsDataProvider", lambda *_args, **_kwargs: SecondaryProvider()
    )

    result = NewsService(
        {
            "provider_priority": "marketaux,newsdata",
            "enabled_providers": "marketaux,newsdata",
            "strict_ai_analysis_mode": False,
            "force_all_providers": False,
            "cache_enabled": False,
            "enable_yfinance_fallback": False,
            "secondary_fetch_threshold": 5,
            "min_relevance_score": 50,
            "prompt_min_relevance_score": 65,
        }
    ).fetch_news("BBCA.JK")

    assert result["provider_status"] == {
        "marketaux": "success",
        "newsdata": "skipped_sufficient_primary",
    }
    assert result["articles_found"] == 5
    assert result["articles_used_in_prompt"] == 5
    assert "BBCA earnings remain resilient" in format_news_for_prompt(result)


def test_news_service_skips_marketaux_when_google_news_is_sufficient(monkeypatch):
    primary_articles = [
        NormalizedNewsArticle(
            provider="google_news_light",
            provider_article_id=f"google-{index}",
            ticker="BBCA.JK",
            title=f"BBCA Google News Light Article {index}",
            url=f"https://example.com/google-{index}",
            relevance_score=90,
        )
        for index in range(3)
    ]

    class GoogleProvider:
        api_key = "configured"

        def fetch_news(self, *_args, **_kwargs):
            return ProviderFetchResult(provider="google_news_light", status="success", articles=primary_articles)

    class MarketAuxProviderStub:
        api_key = "configured"

        def fetch_news(self, *_args, **_kwargs):
            raise AssertionError("MarketAux should be skipped.")

    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.GoogleNewsLightProvider", lambda *_args, **_kwargs: GoogleProvider()
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.MarketAuxProvider", lambda *_args, **_kwargs: MarketAuxProviderStub()
    )

    result = NewsService(
        {
            "provider_priority": "google_news_light,marketaux",
            "enabled_providers": "google_news_light,marketaux",
            "strict_ai_analysis_mode": False,
            "force_all_providers": False,
            "cache_enabled": False,
            "enable_yfinance_fallback": False,
            "fetch_secondary_always": False,
            "secondary_fetch_threshold": 3,
            "min_relevance_score": 50,
            "prompt_min_relevance_score": 65,
        }
    ).fetch_news("BBCA.JK")

    assert result["provider_status"] == {
        "google_news_light": "success",
        "marketaux": "skipped_sufficient_primary",
    }
    assert result["providers_used"] == ["google_news_light", "marketaux"]


def test_news_service_uses_marketaux_when_google_news_is_below_threshold(monkeypatch):
    google_articles = [
        NormalizedNewsArticle(
            provider="google_news_light",
            ticker="BBCA.JK",
            title="Low relevance market article",
            url="https://example.com/google-low",
            relevance_score=10,
        )
    ]
    marketaux_articles = [
        NormalizedNewsArticle(
            provider="marketaux",
            ticker="BBCA.JK",
            title="BBCA marketaux article",
            url="https://example.com/marketaux",
            relevance_score=90,
        )
    ]

    class Provider:
        api_key = "configured"

        def __init__(self, provider: str) -> None:
            self.provider = provider

        def fetch_news(self, *_args, **_kwargs):
            articles = google_articles if self.provider == "google_news_light" else marketaux_articles
            return ProviderFetchResult(provider=self.provider, status="success", articles=articles)

    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.GoogleNewsLightProvider",
        lambda *_args, **_kwargs: Provider("google_news_light"),
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.MarketAuxProvider", lambda *_args, **_kwargs: Provider("marketaux")
    )

    result = NewsService(
        {
            "provider_priority": "google_news_light,marketaux",
            "enabled_providers": "google_news_light,marketaux",
            "strict_ai_analysis_mode": False,
            "force_all_providers": False,
            "cache_enabled": False,
            "enable_yfinance_fallback": False,
            "fetch_secondary_always": False,
            "secondary_fetch_threshold": 3,
            "min_relevance_score": 50,
            "prompt_min_relevance_score": 65,
        }
    ).fetch_news("BBCA.JK")

    assert result["provider_status"] == {"google_news_light": "success", "marketaux": "success"}
    assert result["articles_found"] == 1
    assert result["articles"][0]["provider"] == "marketaux"


def test_news_service_accepts_list_provider_config_with_cache(monkeypatch):
    articles = [
        NormalizedNewsArticle(
            provider="google_news_light",
            ticker="BBCA.JK",
            title="BBCA cached provider config article",
            url="https://example.com/google-cache",
            relevance_score=90,
        )
    ]

    class GoogleProvider:
        api_key = "configured"

        def fetch_news(self, *_args, **_kwargs):
            return ProviderFetchResult(provider="google_news_light", status="success", articles=articles)

    monkeypatch.setattr("tradingagents.dataflows.news_service.SQLiteTTLCache", None)
    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.GoogleNewsLightProvider", lambda *_args, **_kwargs: GoogleProvider()
    )

    result = NewsService(
        {
            "provider_priority": ["google_news_light"],
            "enabled_providers": ["google_news_light"],
            "strict_ai_analysis_mode": False,
            "force_all_providers": False,
            "cache_enabled": True,
            "enable_yfinance_fallback": False,
            "min_relevance_score": 50,
            "prompt_min_relevance_score": 65,
        }
    ).fetch_news("BBCA.JK")

    assert result["articles_found"] == 1


def test_news_service_deduplicates_and_filters_low_relevance(monkeypatch):
    articles = [
        NormalizedNewsArticle(
            provider="marketaux",
            ticker="BBCA.JK",
            title="Duplicate headline",
            url="https://example.com/news?utm_source=test",
            relevance_score=90,
            entities=[NewsEntity(symbol="BBCA.JK")],
        ),
        NormalizedNewsArticle(
            provider="newsdata",
            ticker="BBCA.JK",
            title="Duplicate headline",
            url="https://example.com/news",
            relevance_score=70,
        ),
        NormalizedNewsArticle(
            provider="newsdata",
            ticker="BBCA.JK",
            title="Low relevance market article",
            url="https://example.com/low",
            relevance_score=10,
        ),
    ]

    class Provider:
        api_key = "configured"

        def __init__(self, provider: str) -> None:
            self.provider = provider

        def fetch_news(self, *_args, **_kwargs):
            selected = [article for article in articles if article.provider == self.provider]
            return ProviderFetchResult(provider=self.provider, status="success", articles=selected)

    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.MarketAuxProvider", lambda *_args, **_kwargs: Provider("marketaux")
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news_service.NewsDataProvider", lambda *_args, **_kwargs: Provider("newsdata")
    )

    result = NewsService(
        {
            "provider_priority": "marketaux,newsdata",
            "enabled_providers": "marketaux,newsdata",
            "strict_ai_analysis_mode": False,
            "force_all_providers": False,
            "fetch_secondary_always": True,
            "cache_enabled": False,
            "enable_yfinance_fallback": False,
            "min_relevance_score": 50,
            "prompt_min_relevance_score": 65,
        }
    ).fetch_news("BBCA.JK")

    assert result["articles_found"] == 1
    assert result["articles"][0]["provider"] == "marketaux"


def test_sanitize_params_redacts_vendor_secrets():
    assert sanitize_params({"apikey": "secret", "api_token": "secret-2", "symbol": "BBCA"}) == {
        "apikey": "***REDACTED***",
        "api_token": "***REDACTED***",
        "symbol": "BBCA",
    }


def test_historical_analysis_excludes_future_news():
    articles = [
        NormalizedNewsArticle(
            provider="marketaux",
            ticker="BBCA.JK",
            title="Included article",
            url="https://example.com/included",
            published_at="2026-05-15T08:00:00Z",
        ),
        NormalizedNewsArticle(
            provider="marketaux",
            ticker="BBCA.JK",
            title="Future article",
            url="https://example.com/future",
            published_at="2026-05-20T08:00:00Z",
        ),
    ]

    filtered = _filter_articles_by_window(articles, as_of_date="2026-05-18", window_days=30)

    assert [article.title for article in filtered] == ["Included article"]
