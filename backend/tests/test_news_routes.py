from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from owner_session import issue_owner_session
from routes.news import include_news_routes


def _news_response(ticker: str) -> dict:
    return {
        "enabled": True,
        "ticker": ticker,
        "company_name": "Bank Central Asia",
        "window_days": 30,
        "providers_used": ["marketaux"],
        "provider_status": {"marketaux": "success"},
        "articles_found": 1,
        "articles_used_in_prompt": 1,
        "articles": [
            {
                "provider": "marketaux",
                "ticker": ticker,
                "title": "BBCA earnings remain resilient",
                "url": "https://example.com/bbca",
                "relevance_score": 92,
            }
        ],
        "cache": {"hit": False},
    }


def test_news_endpoint_returns_normalized_articles(client, monkeypatch):
    monkeypatch.setattr("routes.news._fetch_news", lambda ticker, **_kwargs: _news_response(ticker))

    response = client.get("/api/news/BBCA.JK")

    assert response.status_code == 200
    assert response.json()["ticker"] == "BBCA.JK"
    assert response.json()["articles"][0]["provider"] == "marketaux"


def test_debug_news_endpoint_rejects_unknown_provider(client):
    response = client.get("/api/debug/news/BBCA.JK?provider=unknown")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def _news_client(*, is_development: bool) -> TestClient:
    app = FastAPI()
    include_news_routes(app, prefix="/api", is_development=is_development)
    return TestClient(app, headers={"x-owner-token": issue_owner_session()["owner_token"]})


def test_debug_news_endpoint_is_not_registered_in_production():
    response = _news_client(is_development=False).get("/api/debug/news/BBCA.JK?provider=marketaux")

    assert response.status_code == 404


def test_debug_news_endpoint_is_registered_in_development_with_raw_response_disabled_by_default(
    monkeypatch,
):
    calls = []
    monkeypatch.setattr(
        "routes.news._fetch_news",
        lambda ticker, **kwargs: (
            calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker)
        ),
    )

    response = _news_client(is_development=True).get("/api/debug/news/BBCA.JK?provider=marketaux")

    assert response.status_code == 200
    assert calls == [
        {
            "ticker": "BBCA.JK",
            "window_days": 30,
            "limit": 20,
            "provider": "marketaux",
            "debug": True,
            "include_raw": False,
        }
    ]


def test_debug_news_endpoint_accepts_google_news_light(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "routes.news._fetch_news",
        lambda ticker, **kwargs: (
            calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker)
        ),
    )

    response = _news_client(is_development=True).get(
        "/api/debug/news/BBCA.JK?provider=google_news_light"
    )

    assert response.status_code == 200
    assert calls[0]["provider"] == "google_news_light"


def test_debug_news_endpoint_accepts_rss_context_and_yfinance(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "routes.news._fetch_news",
        lambda ticker, **kwargs: (
            calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker)
        ),
    )

    rss_response = _news_client(is_development=True).get(
        "/api/debug/news/BBCA.JK?provider=rss_context"
    )
    yfinance_response = _news_client(is_development=True).get(
        "/api/debug/news/BBCA.JK?provider=yfinance"
    )

    assert rss_response.status_code == 200
    assert yfinance_response.status_code == 200
    assert [call["provider"] for call in calls] == ["rss_context", "yfinance"]


def test_debug_news_endpoint_runs_full_pipeline_without_provider(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "routes.news._fetch_news",
        lambda ticker, **kwargs: (
            calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker)
        ),
    )

    response = _news_client(is_development=True).get("/api/debug/news/BBCA.JK")

    assert response.status_code == 200
    assert calls[0]["provider"] is None
    assert calls[0]["debug"] is True


def test_ticker_news_stream_route_is_registered_without_changing_news_schema():
    response = _news_client(is_development=True).get("/api/news/BBCA.JK/stream?poll_seconds=1")

    assert response.status_code == 422
    assert "poll_seconds" in response.text


def test_ticker_news_stream_generator_emits_ready_event(monkeypatch):
    import asyncio
    import json

    from routes.news import _stream_ticker_news_events

    class FakeRequest:
        async def is_disconnected(self):
            return False

    class FakeLease:
        def __init__(self):
            self.exited = False

        async def __aexit__(self, *_args):
            self.exited = True

    async def exercise_stream():
        monkeypatch.setattr(
            "routes.news._fetch_news", lambda ticker, **_kwargs: _news_response(ticker)
        )
        lease = FakeLease()
        stream = _stream_ticker_news_events(
            FakeRequest(),
            lease,
            ticker="BBCA.JK",
            window_days=30,
            limit=20,
            poll_seconds=30,
        )
        event = await anext(stream)
        await stream.aclose()

        assert lease.exited is True
        assert event["event"] == "ticker_news_stream_ready"
        assert json.loads(event["data"]) == {"ticker": "BBCA.JK", "poll_seconds": 30}

    asyncio.run(exercise_stream())


def test_ticker_news_event_bus_publishes_only_new_articles():
    import asyncio

    from tradingagents.dataflows.news.ticker_news_stream import ticker_news_event_bus

    async def exercise_bus():
        ticker_news_event_bus.reset_for_tests()
        baseline = {
            "ticker": "BBCA.JK",
            "articles_found": 1,
            "latest_article_date": "2026-06-19",
            "articles": [{"url": "https://example.com/1"}],
        }
        changed = {
            **baseline,
            "articles_found": 2,
            "articles": [
                {"url": "https://example.com/1"},
                {"url": "https://example.com/2"},
            ],
        }

        assert await ticker_news_event_bus.publish_if_changed(baseline) is False
        stream = ticker_news_event_bus.subscribe("bbca.jk")
        next_event = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        assert await ticker_news_event_bus.publish_if_changed(changed) is True
        event = await asyncio.wait_for(next_event, timeout=1)
        await stream.aclose()

        assert event["ticker"] == "BBCA.JK"
        assert event["new_count"] == 1
        assert event["articles_found"] == 2

    asyncio.run(exercise_bus())
