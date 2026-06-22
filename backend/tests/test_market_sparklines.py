from __future__ import annotations

import routes.market as market_routes


def test_market_sparklines_returns_symbol_map(client, monkeypatch):
    market_routes._SPARKLINE_CACHE.clear()
    calls: list[tuple[tuple[str, ...], str]] = []

    async def fake_fetch_sparklines(symbols, range_key):
        calls.append((tuple(symbols), range_key))
        return {"NVDA": [189.2, 191.4, 195.8, 210.69], "AAPL": [304.2, 301.1, 298.01]}

    monkeypatch.setattr("routes.market._fetch_sparklines", fake_fetch_sparklines)

    response = client.get("/api/market/sparklines?symbols=NVDA,AAPL&range=1M")

    assert response.status_code == 200
    assert response.json() == {
        "sparklines": {"NVDA": [189.2, 191.4, 195.8, 210.69], "AAPL": [304.2, 301.1, 298.01]}
    }
    assert calls == [(("NVDA", "AAPL"), "1M")]


def test_market_sparklines_rejects_invalid_range(client, monkeypatch):
    async def should_not_fetch(symbols, range_key):
        raise AssertionError(f"unexpected vendor fetch: {symbols} {range_key}")

    monkeypatch.setattr("routes.market._fetch_sparklines", should_not_fetch)

    response = client.get("/api/market/sparklines?symbols=NVDA&range=2Y")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_market_sparklines_rejects_too_many_symbols(client, monkeypatch):
    async def should_not_fetch(symbols, range_key):
        raise AssertionError(f"unexpected vendor fetch: {symbols} {range_key}")

    monkeypatch.setattr("routes.market._fetch_sparklines", should_not_fetch)
    symbols = ",".join(f"AAA{index}" for index in range(21))

    response = client.get(f"/api/market/sparklines?symbols={symbols}&range=1M")

    assert response.status_code == 400
    assert (
        response.json()["error"]["details"]["fields"]["symbols"] == "symbols.length must be <= 20."
    )


def test_market_sparklines_uses_cache(client, monkeypatch):
    market_routes._SPARKLINE_CACHE.clear()
    calls = 0

    async def fake_fetch_sparklines(symbols, range_key):
        nonlocal calls
        calls += 1
        return {symbols[0]: [1.0, 2.0, 3.0]}

    monkeypatch.setattr("routes.market._fetch_sparklines", fake_fetch_sparklines)

    first = client.get("/api/market/sparklines?symbols=AAPL&range=1M")
    second = client.get("/api/market/sparklines?symbols=AAPL&range=1M")

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == 1
    assert second.json()["sparklines"] == {"AAPL": [1.0, 2.0, 3.0]}
