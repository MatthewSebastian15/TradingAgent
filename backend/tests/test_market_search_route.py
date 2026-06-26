from __future__ import annotations

from time import monotonic

import routes.market as market_routes


def test_market_search_returns_meta_object(client):
    response = client.get("/api/market/search?q=bb&limit=3")

    assert response.status_code == 200
    payload = response.json()
    assert payload["results"]
    assert payload["meta"]["query"] == "bb"
    assert payload["meta"]["source"] == "local_universe"
    assert isinstance(payload["meta"]["latency_ms"], int)


def test_market_search_returns_local_result_without_yfinance_if_local_result_enough(
    client, monkeypatch
):
    market_routes._SEARCH_CACHE.clear()

    def fail_search(query: str, limit: int):
        raise AssertionError(f"unexpected yfinance search: {query} {limit}")

    monkeypatch.setattr("routes.market._search_tickers", fail_search)

    response = client.get("/api/market/search?q=bb&limit=3")

    assert response.status_code == 200
    assert [item["symbol"] for item in response.json()["results"]] == [
        "BBCA.JK",
        "BBRI.JK",
        "BBNI.JK",
    ]
    assert response.json()["meta"]["remote_refresh_queued"] is False


def test_market_search_returns_cached_remote_result_when_cache_fresh(client):
    market_routes._SEARCH_CACHE.clear()
    market_routes._SEARCH_CACHE[("zzzzzz!", 5, "ALL", "ALL")] = (
        monotonic(),
        [
            {
                "symbol": "RMT",
                "name": "Remote Cached",
                "exchange": "NASDAQ",
                "type": "EQUITY",
                "market": "US",
                "source": "yfinance_search",
            }
        ],
    )

    response = client.get("/api/market/search?q=zzzzzz%21&limit=5")

    assert response.status_code == 200
    assert response.json()["results"][0]["symbol"] == "RMT"
    assert response.json()["meta"]["cache_hit"] is True
    assert response.json()["meta"]["source"] == "remote_cache"


def test_market_search_queues_background_refresh_when_cache_miss(client, monkeypatch):
    market_routes._SEARCH_CACHE.clear()
    calls: list[tuple[str, int]] = []

    def fake_search(query: str, limit: int):
        calls.append((query, limit))
        return []

    monkeypatch.setattr("routes.market._search_tickers", fake_search)

    response = client.get("/api/market/search?q=zzzzzz%21&limit=5")

    assert response.status_code == 200
    assert response.json()["meta"]["remote_refresh_queued"] is True
    assert calls == [("zzzzzz!", 5)]


def test_market_search_never_calls_quote_or_price_fetch_functions(client, monkeypatch):
    monkeypatch.setattr(
        "routes.market._fetch_quote",
        lambda symbol: (_ for _ in ()).throw(AssertionError(f"quote called for {symbol}")),
    )
    monkeypatch.setattr(
        "routes.market._fetch_sparkline",
        lambda symbol, range_key: (_ for _ in ()).throw(AssertionError("sparkline called")),
    )
    monkeypatch.setattr(
        "routes.market.fetch_ohlcv_range",
        lambda symbol, range_key, trade_date: (_ for _ in ()).throw(AssertionError("ohlcv called")),
    )

    response = client.get("/api/market/search?q=bb&limit=3")

    assert response.status_code == 200
    assert response.json()["results"]


def test_market_search_warmup_returns_popular_tickers(client):
    response = client.get("/api/market/search/warmup")

    assert response.status_code == 200
    payload = response.json()
    assert payload["popular"][0]["symbol"] == "AAPL"
    assert "US" in payload["markets"]
    assert "EQUITY" in payload["types"]
    assert payload["meta"]["source"] == "local_universe"


def test_market_search_warmup_does_not_call_yfinance(client, monkeypatch):
    def fail_search(query: str, limit: int):
        raise AssertionError(f"unexpected yfinance search: {query} {limit}")

    monkeypatch.setattr("routes.market._search_tickers", fail_search)

    response = client.get("/api/market/search/warmup")

    assert response.status_code == 200
    assert response.json()["popular"]
