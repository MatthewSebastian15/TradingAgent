from __future__ import annotations

import sys
from types import SimpleNamespace

import pandas as pd

import routes.market as market_routes


def test_market_quotes_returns_valid_symbols(client, monkeypatch):
    async def fake_fetch_quotes(symbols):
        assert symbols == ["BBCA.JK", "NVDA"]
        return [
            {"sym": "BBCA.JK", "chg": "+1.25%", "pos": True, "price": 9800, "volume": 1200000, "error": False},
            {"sym": "NVDA", "chg": "-0.50%", "pos": False, "price": 920, "volume": 246900000, "error": False},
        ]

    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)

    response = client.get("/api/market/quotes?symbols=BBCA.JK,NVDA")

    assert response.status_code == 200
    assert response.json()["quotes"] == [
        {"sym": "BBCA.JK", "chg": "+1.25%", "pos": True, "price": 9800.0, "volume": 1200000.0, "error": False},
        {"sym": "NVDA", "chg": "-0.50%", "pos": False, "price": 920.0, "volume": 246900000.0, "error": False},
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
        return [
            {"sym": symbol, "chg": "N/A", "pos": True, "price": None, "volume": None, "error": False}
            for symbol in symbols
        ]

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
            fast_info=SimpleNamespace(
                previous_close=100, regularMarketPreviousClose=100, last_price=None
            )
        )
    )
    monkeypatch.setitem(sys.modules, "tradingagents.yfinance_runtime", SimpleNamespace(yf=fake_yf))

    quote = market_routes._fetch_quote("AAPL")

    assert quote == {"sym": "AAPL", "chg": "N/A", "pos": True, "price": None, "volume": None, "error": False}


def test_fetch_quote_handles_previous_close_zero(monkeypatch):
    fake_yf = SimpleNamespace(
        Ticker=lambda _symbol: SimpleNamespace(
            fast_info=SimpleNamespace(previous_close=0, regularMarketPreviousClose=0, last_price=10)
        )
    )
    monkeypatch.setitem(sys.modules, "tradingagents.yfinance_runtime", SimpleNamespace(yf=fake_yf))

    quote = market_routes._fetch_quote("AAPL")

    assert quote == {"sym": "AAPL", "chg": "N/A", "pos": True, "price": 10, "volume": None, "error": False}


def test_fetch_quote_returns_error_payload_on_vendor_failure(monkeypatch):
    def raise_timeout(_symbol):
        raise TimeoutError("vendor timeout")

    monkeypatch.setitem(
        sys.modules,
        "tradingagents.yfinance_runtime",
        SimpleNamespace(yf=SimpleNamespace(Ticker=raise_timeout)),
    )

    quote = market_routes._fetch_quote("AAPL")

    assert quote == {"sym": "AAPL", "chg": "N/A", "pos": True, "price": None, "volume": None, "error": True}


def test_market_search_returns_local_results_and_warms_yfinance_cache(client, monkeypatch):
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
                "market": "ID",
                "source": "local_universe",
                "price": None,
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

    first_response = client.get("/api/market/search?q=zzzzzz%21&limit=5")
    second_response = client.get("/api/market/search?q=zzzzzz%21&limit=5")

    assert first_response.status_code == 200
    assert second_response.status_code == 200
    assert first_response.json() == {"results": []}
    assert second_response.json() == {"results": []}
    assert calls == [("zzzzzz!", 5)]


def test_market_search_returns_manual_symbol_without_waiting_for_vendor(client, monkeypatch):
    market_routes._SEARCH_CACHE.clear()
    calls: list[tuple[str, int]] = []

    def fake_search(query: str, limit: int):
        calls.append((query, limit))
        return []

    monkeypatch.setattr("routes.market._search_tickers", fake_search)

    response = client.get("/api/market/search?q=META2&limit=5")

    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "symbol": "META2",
                "name": "META2",
                "exchange": "",
                "type": "SYMBOL",
                "market": "US",
                "source": "manual_symbol",
                "price": None,
            }
        ]
    }
    assert calls == [("META2", 5)]


def test_market_ohlcv_ytd_uses_january_first_and_daily(client, monkeypatch):
    market_routes._OHLCV_CACHE.clear()
    calls: list[tuple[str, str, str, str]] = []

    def fake_download(symbol, start_dt, end_dt, interval):
        calls.append((symbol, start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d"), interval))
        return pd.DataFrame(
            {
                "Open": [10, 11],
                "High": [12, 13],
                "Low": [9, 10],
                "Close": [11, 12],
                "Adj Close": [11, 12],
                "Volume": [1000, 1200],
            },
            index=pd.to_datetime(["2026-01-02", "2026-06-08"]),
        )

    monkeypatch.setattr(market_routes, "_download_ohlcv", fake_download)

    response = client.get("/api/market/ohlcv?ticker=NVDA&range=YTD&trade_date=2026-06-09")

    assert response.status_code == 200
    payload = response.json()
    assert calls == [("NVDA", "2026-01-01", "2026-06-09", "1d")]
    assert payload["range"] == "YTD"
    assert payload["interval"] == "1d"
    assert payload["start_date"] == "2026-01-01"
    assert [point["date"] for point in payload["points"]] == ["2026-01-02", "2026-06-08"]


def test_market_ohlcv_uses_daily_when_detail_intervals_empty(client, monkeypatch):
    market_routes._OHLCV_CACHE.clear()
    calls: list[str] = []

    def fake_download(_symbol, _start_dt, _end_dt, interval):
        calls.append(interval)
        if interval != "1d":
            return pd.DataFrame()
        return pd.DataFrame(
            {
                "Open": [20, 21],
                "High": [22, 23],
                "Low": [19, 20],
                "Close": [21, 22],
                "Volume": [2000, 2200],
            },
            index=pd.to_datetime(["2026-06-08", "2026-06-09"]),
        )

    monkeypatch.setattr(market_routes, "_download_ohlcv", fake_download)

    response = client.get("/api/market/ohlcv?ticker=AAPL&range=1W&trade_date=2026-06-09")

    assert response.status_code == 200
    payload = response.json()
    assert calls == ["5m", "15m", "30m", "60m", "1d"]
    assert payload["interval"] == "1d"
    assert payload["fallback_to_daily"] is True
    assert payload["points"][-1]["close"] == 22


def test_market_ohlcv_slices_shared_daily_cache_for_shorter_range(client, monkeypatch):
    market_routes._OHLCV_CACHE.clear()
    calls: list[tuple[str, str, str, str]] = []

    def fake_download(symbol, start_dt, end_dt, interval):
        calls.append((symbol, start_dt.strftime("%Y-%m-%d"), end_dt.strftime("%Y-%m-%d"), interval))
        return pd.DataFrame(
            {
                "Open": [8, 10, 11],
                "High": [9, 12, 13],
                "Low": [7, 9, 10],
                "Close": [8.5, 11, 12],
                "Adj Close": [8.5, 11, 12],
                "Volume": [900, 1000, 1200],
            },
            index=pd.to_datetime(["2025-06-10", "2026-04-01", "2026-06-08"]),
        )

    monkeypatch.setattr(market_routes, "_download_ohlcv", fake_download)

    one_year_response = client.get("/api/market/ohlcv?ticker=NVDA&range=1Y&trade_date=2026-06-09")
    three_month_response = client.get(
        "/api/market/ohlcv?ticker=NVDA&range=3M&trade_date=2026-06-09"
    )

    assert one_year_response.status_code == 200
    assert three_month_response.status_code == 200
    assert calls == [("NVDA", "2025-06-09", "2026-06-09", "1d")]
    assert [point["date"] for point in one_year_response.json()["points"]] == [
        "2025-06-10",
        "2026-04-01",
        "2026-06-08",
    ]
    assert [point["date"] for point in three_month_response.json()["points"]] == [
        "2026-04-01",
        "2026-06-08",
    ]
    assert three_month_response.json()["range"] == "3M"
    assert three_month_response.json()["start_date"] == "2026-03-09"
