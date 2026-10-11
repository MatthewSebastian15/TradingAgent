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
    monkeypatch.setitem(
        sys.modules,
        "tradingagents.dataflows.providers.yfinance_runtime",
        SimpleNamespace(yf=fake_yf),
    )

    quote = market_routes._fetch_quote("AAPL")

    assert quote["volume"] == 1580000.0


def _install_fake_yf(monkeypatch, **fast_info):
    fake_yf = SimpleNamespace(
        Ticker=lambda _symbol: SimpleNamespace(fast_info=SimpleNamespace(**fast_info))
    )
    monkeypatch.setitem(
        sys.modules,
        "tradingagents.dataflows.providers.yfinance_runtime",
        SimpleNamespace(yf=fake_yf),
    )


def test_fetch_quote_returns_currency_exactly_as_reported(monkeypatch):
    _install_fake_yf(monkeypatch, previous_close=100, last_price=110, last_volume=1, currency="GBp")

    quote = market_routes._fetch_quote("VOD.L")

    assert quote["currency"] == "GBp"  # pence, not GBP: case must survive


def test_fetch_quote_currency_is_none_when_the_vendor_omits_it(monkeypatch):
    _install_fake_yf(monkeypatch, previous_close=100, last_price=110, last_volume=1)

    assert market_routes._fetch_quote("AAPL")["currency"] is None


def test_fetch_quote_failure_row_has_no_currency(monkeypatch):
    class Boom:
        @property
        def fast_info(self):
            raise RuntimeError("vendor down")

    monkeypatch.setitem(
        sys.modules,
        "tradingagents.dataflows.providers.yfinance_runtime",
        SimpleNamespace(yf=SimpleNamespace(Ticker=lambda _symbol: Boom())),
    )

    quote = market_routes._fetch_quote("AAPL")

    assert quote["error"] is True
    assert "currency" not in quote


def test_market_quotes_response_passes_currency_through(client, monkeypatch):
    market_routes._QUOTE_CACHE.clear()

    async def fake_fetch_quotes(symbols):
        return [
            {
                "sym": "BBCA.JK",
                "chg": "+1.00%",
                "pos": True,
                "price": 9000.0,
                "volume": 1200,
                "currency": "IDR",
                "error": False,
            },
            {"sym": "ZZZ", "chg": "N/A", "pos": True, "price": None, "volume": None, "error": True},
        ]

    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)

    quotes = client.get("/api/market/quotes?symbols=BBCA.JK,ZZZ").json()["quotes"]

    assert quotes[0]["currency"] == "IDR"
    assert quotes[1]["currency"] is None
