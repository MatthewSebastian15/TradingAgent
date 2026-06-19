from __future__ import annotations

import sys
from types import SimpleNamespace

import routes.market as market_routes


def test_market_quotes_response_includes_volume(client, monkeypatch):
    market_routes._QUOTE_CACHE.clear()

    async def fake_fetch_quotes(symbols):
        assert symbols == ["NVDA"]
        return [
            {
                "sym": "NVDA",
                "chg": "+2.95%",
                "pos": True,
                "price": 210.69,
                "volume": 246900000,
                "error": False,
            }
        ]

    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)

    response = client.get("/api/market/quotes?symbols=NVDA")

    assert response.status_code == 200
    assert response.json()["quotes"][0]["volume"] == 246900000.0


def test_market_quotes_rejects_invalid_symbol(client, monkeypatch):
    async def should_not_fetch(symbols):
        raise AssertionError(f"unexpected vendor fetch: {symbols}")

    monkeypatch.setattr("routes.market._fetch_quotes", should_not_fetch)

    response = client.get("/api/market/quotes?symbols=@@@")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_market_quotes_cache_keeps_volume(client, monkeypatch):
    market_routes._QUOTE_CACHE.clear()
    calls = 0

    async def fake_fetch_quotes(symbols):
        nonlocal calls
        calls += 1
        return [
            {
                "sym": symbols[0],
                "chg": "+1.00%",
                "pos": True,
                "price": 100.0,
                "volume": 1200,
                "error": False,
            }
        ]

    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)

    first = client.get("/api/market/quotes?symbols=AAPL")
    second = client.get("/api/market/quotes?symbols=AAPL")

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == 1
    assert second.json()["quotes"][0]["volume"] == 1200.0


def test_fetch_quote_reads_volume_from_fast_info(monkeypatch):
    fake_yf = SimpleNamespace(
        Ticker=lambda _symbol: SimpleNamespace(
            fast_info=SimpleNamespace(
                previous_close=100,
                regularMarketPreviousClose=100,
                last_price=110,
                last_volume=1580000,
            )
        )
    )
    monkeypatch.setitem(sys.modules, "tradingagents.yfinance_runtime", SimpleNamespace(yf=fake_yf))

    quote = market_routes._fetch_quote("AAPL")

    assert quote["volume"] == 1580000.0
