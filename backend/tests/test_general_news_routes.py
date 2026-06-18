from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from owner_session import issue_owner_session
from routes.news import include_news_routes


def _general_news_response(category: str = "all") -> dict:
    articles = [
        {
            "id": "rss_context:1",
            "title": "Bitcoin rises after ETF inflows",
            "summary": "Crypto market gains",
            "url": "https://example.com/crypto",
            "source": "CoinDesk",
            "source_domain": "coindesk.com",
            "provider": "rss_context",
            "category": "crypto",
            "published_at": "2026-06-14T10:25:00Z",
            "published_age": "1d",
            "impact": "HIGH",
            "sentiment": "POSITIVE",
        }
    ]
    if category not in {"all", "crypto"}:
        articles = []
    return {
        "enabled": True,
        "mode": "general_news",
        "category": category if category in {"all", "crypto"} else "all",
        "window_days": 7,
        "limit": 50,
        "last_updated": "2026-06-14T10:30:00Z",
        "refresh_interval_seconds": 120,
        "cache": {"enabled": True, "hit": False, "age_seconds": 0},
        "provider_status": {"rss_context": "success"},
        "articles_found": len(articles),
        "articles": articles,
    }


def _client() -> TestClient:
    app = FastAPI()
    include_news_routes(app, prefix="/api", is_development=True)
    return TestClient(app, headers={"x-owner-token": issue_owner_session()["owner_token"]})


def test_get_general_news_returns_200(monkeypatch):
    monkeypatch.setattr(
        "routes.news._fetch_general_news",
        lambda **kwargs: _general_news_response(kwargs["category"]),
    )

    response = _client().get("/api/news/general")

    assert response.status_code == 200
    assert response.json()["mode"] == "general_news"


def test_get_general_news_categories_returns_category_list():
    response = _client().get("/api/news/general/categories")

    assert response.status_code == 200
    assert response.json()["categories"][0] == {"key": "all", "label": "ALL"}


def test_get_general_news_crypto_returns_crypto_only(monkeypatch):
    monkeypatch.setattr(
        "routes.news._fetch_general_news",
        lambda **kwargs: _general_news_response(kwargs["category"]),
    )

    response = _client().get("/api/news/general?category=crypto")

    assert response.status_code == 200
    assert {article["category"] for article in response.json()["articles"]} == {"crypto"}


def test_invalid_category_does_not_crash(monkeypatch):
    monkeypatch.setattr(
        "routes.news._fetch_general_news",
        lambda **kwargs: _general_news_response(kwargs["category"]),
    )

    response = _client().get("/api/news/general?category=invalid")

    assert response.status_code == 200


def test_provider_status_exists(monkeypatch):
    monkeypatch.setattr(
        "routes.news._fetch_general_news",
        lambda **kwargs: _general_news_response(kwargs["category"]),
    )

    response = _client().get("/api/news/general")

    assert response.json()["provider_status"]


def test_provider_status_can_include_rss_context(monkeypatch):
    monkeypatch.setattr(
        "routes.news._fetch_general_news",
        lambda **kwargs: _general_news_response(kwargs["category"]),
    )

    response = _client().get("/api/news/general")

    assert response.json()["provider_status"]["rss_context"] == "success"


def test_response_does_not_include_prompt_articles(monkeypatch):
    monkeypatch.setattr(
        "routes.news._fetch_general_news",
        lambda **kwargs: _general_news_response(kwargs["category"]),
    )

    response = _client().get("/api/news/general")

    assert "prompt_articles" not in response.json()


def test_response_does_not_include_decision_company_news(monkeypatch):
    monkeypatch.setattr(
        "routes.news._fetch_general_news",
        lambda **kwargs: _general_news_response(kwargs["category"]),
    )

    response = _client().get("/api/news/general")

    assert "decision_company_news" not in response.json()
