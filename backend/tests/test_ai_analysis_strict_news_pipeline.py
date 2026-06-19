from __future__ import annotations

from threading import Event

from tradingagents.dataflows.news.news_models import NewsEntity, NormalizedNewsArticle
from tradingagents.dataflows.news.news_provider_base import ProviderFetchResult
from tradingagents.dataflows.news.news_service import NewsService, format_news_for_prompt


def _article(
    provider: str = "marketaux", title: str = "Bank Central Asia reports profit growth"
) -> NormalizedNewsArticle:
    return NormalizedNewsArticle(
        provider=provider,
        ticker="BBCA.JK",
        company_name="Bank Central Asia",
        title=title,
        summary="BBCA reports resilient earnings growth.",
        url=f"https://example.com/{provider}",
        source="Reuters",
        relevance_score=90,
        relevance_category="company_specific",
        market_context_only=False,
        bucket="full_news",
        entities=[NewsEntity(symbol="BBCA.JK", name="Bank Central Asia")],
    )


def _service_config() -> dict[str, object]:
    return {
        "provider_priority": "google_news_light,marketaux,rss_context,newsdata,yfinance",
        "enabled_providers": "google_news_light,marketaux,rss_context,newsdata,yfinance",
        "strict_ai_analysis_mode": True,
        "force_all_providers": True,
        "cache_enabled": False,
        "enable_yfinance_fallback": True,
        "max_articles_for_prompt": 8,
        "decision_min_relevance_score": 70,
        "rss_decision_min_relevance_score": 80,
    }


def test_strict_news_pipeline_calls_all_providers(monkeypatch):
    called: list[str] = []
    yfinance_called: list[str] = []

    class FakeProvider:
        def __init__(self, name: str) -> None:
            self.provider_name = name
            self.api_key = "key" if name != "rss_context" else ""

        def fetch_news(self, *_args, **_kwargs):
            called.append(self.provider_name)
            return ProviderFetchResult(provider=self.provider_name, status="empty", articles=[])

    monkeypatch.setattr(
        NewsService, "_provider", lambda _self, provider_name: FakeProvider(provider_name)
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news.news_service._fetch_yfinance_fallback",
        lambda *_args, **_kwargs: yfinance_called.append("yfinance") or [],
    )

    NewsService(_service_config()).fetch_news("BBCA.JK", bypass_cache=True)

    assert set(called) == {"google_news_light", "marketaux", "rss_context", "newsdata"}
    assert yfinance_called == ["yfinance"]


def test_strict_news_pipeline_does_not_skip_secondary_when_primary_has_articles(monkeypatch):
    called: list[str] = []

    class FakeProvider:
        def __init__(self, name: str) -> None:
            self.provider_name = name
            self.api_key = "key" if name != "rss_context" else ""

        def fetch_news(self, *_args, **_kwargs):
            called.append(self.provider_name)
            articles = (
                [_article("google_news_light")] if self.provider_name == "google_news_light" else []
            )
            return ProviderFetchResult(
                provider=self.provider_name,
                status="success" if articles else "empty",
                articles=articles,
            )

    monkeypatch.setattr(
        NewsService, "_provider", lambda _self, provider_name: FakeProvider(provider_name)
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news.news_service._fetch_yfinance_fallback",
        lambda *_args, **_kwargs: [],
    )

    result = NewsService(_service_config()).fetch_news("BBCA.JK", bypass_cache=True)

    assert set(called) == {"google_news_light", "marketaux", "rss_context", "newsdata"}
    assert "skipped_sufficient_primary" not in result["provider_status"].values()


def test_strict_news_pipeline_provider_failure_continues(monkeypatch):
    called: list[str] = []

    class FakeProvider:
        def __init__(self, name: str) -> None:
            self.provider_name = name
            self.api_key = "key" if name != "rss_context" else ""

        def fetch_news(self, *_args, **_kwargs):
            called.append(self.provider_name)
            if self.provider_name == "marketaux":
                raise RuntimeError("vendor failed")
            return ProviderFetchResult(provider=self.provider_name, status="empty", articles=[])

    monkeypatch.setattr(
        NewsService, "_provider", lambda _self, provider_name: FakeProvider(provider_name)
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news.news_service._fetch_yfinance_fallback",
        lambda *_args, **_kwargs: [],
    )

    result = NewsService(_service_config()).fetch_news("BBCA.JK", bypass_cache=True)

    assert set(called) == {"google_news_light", "marketaux", "rss_context", "newsdata"}
    assert result["provider_status"]["marketaux"] == "unavailable"
    assert "newsdata" in result["provider_status"]


def test_yfinance_is_called_last_and_only_once(monkeypatch):
    call_order: list[str] = []

    class FakeProvider:
        def __init__(self, name: str) -> None:
            self.provider_name = name
            self.api_key = "key" if name != "rss_context" else ""

        def fetch_news(self, *_args, **_kwargs):
            call_order.append(self.provider_name)
            return ProviderFetchResult(provider=self.provider_name, status="empty", articles=[])

    def fake_yfinance(*_args, **_kwargs):
        call_order.append("yfinance")
        return []

    monkeypatch.setattr(
        NewsService, "_provider", lambda _self, provider_name: FakeProvider(provider_name)
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news.news_service._fetch_yfinance_fallback", fake_yfinance
    )

    NewsService(_service_config()).fetch_news("BBCA.JK", bypass_cache=True)

    assert set(call_order[:-1]) == {"google_news_light", "marketaux", "rss_context", "newsdata"}
    assert call_order[-1] == "yfinance"
    assert call_order.count("yfinance") == 1


def test_strict_news_parallel_providers_preserve_priority_output(monkeypatch):
    started: list[str] = []
    both_started = Event()
    release = Event()

    class FakeProvider:
        def __init__(self, name: str) -> None:
            self.provider_name = name
            self.api_key = "key"

        def fetch_news(self, *_args, **_kwargs):
            started.append(self.provider_name)
            if len(started) == 2:
                both_started.set()
                release.set()
            both_started.wait(timeout=1)
            release.wait(timeout=1)
            return ProviderFetchResult(
                provider=self.provider_name,
                status="success",
                articles=[
                    _article(
                        self.provider_name,
                        f"{self.provider_name} Bank Central Asia profit update",
                    )
                ],
            )

    monkeypatch.setattr(
        NewsService, "_provider", lambda _self, provider_name: FakeProvider(provider_name)
    )

    result = NewsService(
        {
            **_service_config(),
            "provider_priority": "google_news_light,marketaux",
            "enabled_providers": "google_news_light,marketaux",
            "force_all_providers": True,
            "enable_yfinance_fallback": False,
        }
    ).fetch_news("BBCA.JK", bypass_cache=True)

    assert set(started) == {"google_news_light", "marketaux"}
    assert result["providers_used"] == ["google_news_light", "marketaux"]
    assert [article["provider"] for article in result["articles"]] == [
        "google_news_light",
        "marketaux",
    ]


def test_strict_news_default_stops_before_yfinance_when_enough_articles(monkeypatch):
    google_articles = [
        _article("google_news_light", f"Bank Central Asia article {index}") for index in range(5)
    ]
    yfinance_called: list[str] = []

    class GoogleProvider:
        api_key = "key"

        def fetch_news(self, *_args, **_kwargs):
            return ProviderFetchResult(
                provider="google_news_light", status="success", articles=google_articles
            )

    monkeypatch.setattr(
        NewsService, "_provider", lambda _self, _provider_name: GoogleProvider()
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news.news_service._fetch_yfinance_fallback",
        lambda *_args, **_kwargs: yfinance_called.append("yfinance") or [],
    )

    result = NewsService(
        {
            **_service_config(),
            "provider_priority": "google_news_light,yfinance",
            "enabled_providers": "google_news_light,yfinance",
            "force_all_providers": False,
            "secondary_fetch_threshold": 5,
        }
    ).fetch_news("BBCA.JK", bypass_cache=True)

    assert result["provider_status"] == {
        "google_news_light": "success",
        "yfinance": "skipped_sufficient_primary",
    }
    assert yfinance_called == []


def test_format_news_for_prompt_uses_decision_company_news_only():
    context = {
        "ticker": "BBCA.JK",
        "decision_company_news": [
            {
                "provider": "marketaux",
                "title": "Bank Central Asia reports profit growth",
                "summary": "Profit increased year over year.",
                "source": "Reuters",
                "relevance_score": 90,
                "relevance_category": "company_specific",
                "sentiment_label": "positive",
            }
        ],
        "market_context_news": [
            {
                "provider": "rss_context",
                "title": "Asian markets rise",
                "summary": "Macro news.",
            }
        ],
    }

    text = format_news_for_prompt(context)

    assert "Bank Central Asia reports profit growth" in text
    assert "Asian markets rise" not in text
    assert "https://example.com" not in text


def test_strict_api_response_contract_and_debug(monkeypatch):
    class FakeProvider:
        def __init__(self, name: str) -> None:
            self.provider_name = name
            self.api_key = "key" if name != "rss_context" else ""

        def fetch_news(self, *_args, **_kwargs):
            articles = [_article("marketaux")] if self.provider_name == "marketaux" else []
            return ProviderFetchResult(
                provider=self.provider_name,
                status="success" if articles else "empty",
                articles=articles,
            )

    monkeypatch.setattr(
        NewsService, "_provider", lambda _self, provider_name: FakeProvider(provider_name)
    )
    monkeypatch.setattr(
        "tradingagents.dataflows.news.news_service._fetch_yfinance_fallback",
        lambda *_args, **_kwargs: [],
    )

    result = NewsService(_service_config()).fetch_news("BBCA.JK", debug=True, bypass_cache=True)

    assert result["providers_used"] == [
        "google_news_light",
        "marketaux",
        "rss_context",
        "newsdata",
        "yfinance",
    ]
    assert result["articles_used_in_prompt"] == 1
    assert len(result["decision_company_news"]) == 1
    assert result["market_context_news"] == []
    assert result["strict_news_filter"]["enabled"] is True
    assert "provider_attempts" in result["debug"]
    assert "deduplication" in result["debug"]
    assert "strict_news_filter" in result["debug"]
