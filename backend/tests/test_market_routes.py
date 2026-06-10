from __future__ import annotations

import sys
from types import SimpleNamespace

import routes.market as market_routes


def test_market_quotes_returns_valid_symbols(client, monkeypatch):
    async def fake_fetch_quotes(symbols):
        assert symbols == ["BBCA.JK", "NVDA"]
        return [
            {"sym": "BBCA.JK", "chg": "+1.25%", "pos": True, "price": 9800, "error": False},
            {"sym": "NVDA", "chg": "-0.50%", "pos": False, "price": 920, "error": False},
        ]

    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)

    response = client.get("/api/market/quotes?symbols=BBCA.JK,NVDA")

    assert response.status_code == 200
    assert response.json()["quotes"] == [
        {"sym": "BBCA.JK", "chg": "+1.25%", "pos": True, "price": 9800.0, "error": False},
        {"sym": "NVDA", "chg": "-0.50%", "pos": False, "price": 920.0, "error": False},
    ]


def test_market_quotes_rejects_invalid_symbol_before_vendor_fetch(client, monkeypatch):
    async def should_not_fetch(symbols):
        raise AssertionError(f"unexpected vendor fetch: {symbols}")

    monkeypatch.setattr("routes.market._fetch_quotes", should_not_fetch)

    response = client.get("/api/market/quotes?symbols=@@@,AAPL")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"
    assert "ticker" in response.json()["error"]["details"]["fields"]


def test_market_quotes_caps_symbols_to_twenty(client, monkeypatch):
    seen_symbols: list[str] = []

    async def fake_fetch_quotes(symbols):
        seen_symbols.extend(symbols)
        return [{"sym": symbol, "chg": "N/A", "pos": True, "price": None, "error": False} for symbol in symbols]

    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)
    symbols = ",".join(f"AAA{i}" for i in range(25))

    response = client.get(f"/api/market/quotes?symbols={symbols}")

    assert response.status_code == 200
    assert len(response.json()["quotes"]) == 20
    assert len(seen_symbols) == 20
    assert seen_symbols[-1] == "AAA19"


def test_fetch_quote_handles_missing_last_price(monkeypatch):
    fake_yf = SimpleNamespace(
        Ticker=lambda _symbol: SimpleNamespace(
            fast_info=SimpleNamespace(previous_close=100, regularMarketPreviousClose=100, last_price=None)
        )
    )
    monkeypatch.setitem(sys.modules, "tradingagents.yfinance_runtime", SimpleNamespace(yf=fake_yf))

    quote = market_routes._fetch_quote("AAPL")

    assert quote == {"sym": "AAPL", "chg": "N/A", "pos": True, "price": None, "error": False}


def test_fetch_quote_handles_previous_close_zero(monkeypatch):
    fake_yf = SimpleNamespace(
        Ticker=lambda _symbol: SimpleNamespace(
            fast_info=SimpleNamespace(previous_close=0, regularMarketPreviousClose=0, last_price=10)
        )
    )
    monkeypatch.setitem(sys.modules, "tradingagents.yfinance_runtime", SimpleNamespace(yf=fake_yf))

    quote = market_routes._fetch_quote("AAPL")

    assert quote == {"sym": "AAPL", "chg": "N/A", "pos": True, "price": 10, "error": False}


def test_fetch_quote_returns_error_payload_on_vendor_failure(monkeypatch):
    class BrokenYF:
        def Ticker(self, _symbol):
            raise TimeoutError("vendor timeout")

    monkeypatch.setitem(sys.modules, "tradingagents.yfinance_runtime", SimpleNamespace(yf=BrokenYF()))

    quote = market_routes._fetch_quote("AAPL")

    assert quote == {"sym": "AAPL", "chg": "N/A", "pos": True, "price": None, "error": True}


def test_market_search_returns_yfinance_results_and_uses_cache(client, monkeypatch):
    market_routes._SEARCH_CACHE.clear()
    calls: list[tuple[str, int]] = []

    def fake_search(query: str, limit: int):
        calls.append((query, limit))
        return [
            {
                "symbol": "BBCA.JK",
                "name": "Bank Central Asia Tbk PT",
                "exchange": "IDX",
                "type": "EQUITY",
                "price": 9800.0,
            }
        ]

    monkeypatch.setattr("routes.market._search_tickers", fake_search)

    first_response = client.get("/api/market/search?q=bbca&limit=10")
    second_response = client.get("/api/market/search?q=bbca&limit=10")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json() == {
        "results": [
            {
                "symbol": "BBCA.JK",
                "name": "Bank Central Asia Tbk PT",
                "exchange": "IDX",
                "type": "EQUITY",
                "price": 9800.0,
            }
        ]
    }
    assert second_response.json() == first_response.json()
    assert calls == [("bbca", 10)]


def test_market_search_caches_empty_yfinance_results(client, monkeypatch):
    market_routes._SEARCH_CACHE.clear()
    calls: list[tuple[str, int]] = []

    def fake_search(query: str, limit: int):
        calls.append((query, limit))
        return []

    monkeypatch.setattr("routes.market._search_tickers", fake_search)

    first_response = client.get("/api/market/search?q=zzzzzz&limit=5")
    second_response = client.get("/api/market/search?q=zzzzzz&limit=5")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json() == {"results": []}
    assert second_response.json() == {"results": []}
    assert calls == [("zzzzzz", 5)]
