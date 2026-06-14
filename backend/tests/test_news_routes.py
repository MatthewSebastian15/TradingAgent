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


def test_debug_news_endpoint_is_registered_in_development_with_raw_response_disabled_by_default(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "routes.news._fetch_news",
        lambda ticker, **kwargs: calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker),
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
        lambda ticker, **kwargs: calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker),
    )

    response = _news_client(is_development=True).get("/api/debug/news/BBCA.JK?provider=google_news_light")

    assert response.status_code == 200
    assert calls[0]["provider"] == "google_news_light"


def test_debug_news_endpoint_accepts_rss_context_and_yfinance(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "routes.news._fetch_news",
        lambda ticker, **kwargs: calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker),
    )

    rss_response = _news_client(is_development=True).get("/api/debug/news/BBCA.JK?provider=rss_context")
    yfinance_response = _news_client(is_development=True).get("/api/debug/news/BBCA.JK?provider=yfinance")

    assert rss_response.status_code == 200
    assert yfinance_response.status_code == 200
    assert [call["provider"] for call in calls] == ["rss_context", "yfinance"]


def test_debug_news_endpoint_runs_full_pipeline_without_provider(monkeypatch):
    calls = []
    monkeypatch.setattr(
        "routes.news._fetch_news",
        lambda ticker, **kwargs: calls.append({"ticker": ticker, **kwargs}) or _news_response(ticker),
    )

    response = _news_client(is_development=True).get("/api/debug/news/BBCA.JK")

    assert response.status_code == 200
    assert calls[0]["provider"] is None
    assert calls[0]["debug"] is True
