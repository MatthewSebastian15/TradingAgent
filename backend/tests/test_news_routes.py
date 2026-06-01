from __future__ import annotations


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
