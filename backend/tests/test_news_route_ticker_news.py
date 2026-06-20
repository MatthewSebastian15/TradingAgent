def test_news_route_accepts_force_refresh(client, monkeypatch):
    calls = []

    def fake_fetch(ticker, **kwargs):
        calls.append({"ticker": ticker, **kwargs})
        return {
            "enabled": True,
            "mode": "ticker_news",
            "ticker": ticker,
            "company_name": "Bank Central Asia",
            "provider_status": {"google_news_light": "missing_api_key"},
            "articles": [],
            "decision_company_news": [],
            "market_context_news": [],
            "prompt_articles": [],
            "strict_news_filter": {"enabled": True},
            "cache": {"hit": False},
        }

    monkeypatch.setattr("routes.news._fetch_news", fake_fetch)

    response = client.get("/api/news/BBCA.JK?force_refresh=true&provider=google_news_light")

    assert response.status_code == 200
    assert calls[0]["force_refresh"] is True
    assert calls[0]["provider"] == "google_news_light"
    assert response.json()["provider_status"]["google_news_light"] == "missing_api_key"
