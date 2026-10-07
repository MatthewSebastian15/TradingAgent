from __future__ import annotations

from services.market import yfinance_service as service


def test_get_overview_data_uses_cache_without_force_refresh(monkeypatch):
    service.market_cache.clear()
    calls: list[list[str]] = []

    def fake_build_overview_items(symbols):
        calls.append(symbols)
        return [{"symbol": symbol, "label": symbol, "status": "ok"} for symbol in symbols]

    monkeypatch.setattr(service, "_build_overview_items", fake_build_overview_items)

    first = service.get_overview_data(["SPY", "QQQ", "DIA"])
    second = service.get_overview_data(["SPY", "QQQ", "DIA"])

    assert calls == [["SPY", "QQQ", "DIA"]]
    assert first["cache"] == {"hit": False, "ttl_seconds": 120, "force_refresh": False}
    assert second["cache"] == {"hit": True, "ttl_seconds": 120, "force_refresh": False}
    assert second["source"] == "yfinance"
    assert second["last_updated"] == first["last_updated"]


def test_get_overview_data_bypasses_cache_with_force_refresh(monkeypatch):
    service.market_cache.clear()
    calls: list[list[str]] = []

    def fake_build_overview_items(symbols):
        calls.append(symbols)
        return [{"symbol": symbol, "label": symbol, "status": "ok"} for symbol in symbols]

    monkeypatch.setattr(service, "_build_overview_items", fake_build_overview_items)

    service.get_overview_data(["SPY", "QQQ", "DIA"])
    refreshed = service.get_overview_data(["SPY", "QQQ", "DIA"], force_refresh=True)
    cached = service.get_overview_data(["SPY", "QQQ", "DIA"])

    assert calls == [["SPY", "QQQ", "DIA"], ["SPY", "QQQ", "DIA"]]
    assert refreshed["cache"] == {"hit": False, "ttl_seconds": 120, "force_refresh": True}
    assert cached["cache"] == {"hit": True, "ttl_seconds": 120, "force_refresh": False}


def test_get_overview_data_returns_metadata_when_no_items(monkeypatch):
    service.market_cache.clear()
    monkeypatch.setattr(service, "_build_overview_items", lambda _symbols: [])

    payload = service.get_overview_data(["SPY", "QQQ", "DIA"], force_refresh=True)

    assert payload["items"] == []
    assert payload["source"] == "yfinance"
    assert payload["last_updated"]
    assert payload["cache"]["hit"] is False
    assert payload["message"] == "No market data available from yfinance"


def test_build_stock_overview_exposes_financial_currency(monkeypatch):
    import tradingagents.dataflows.providers.y_finance as y_finance

    monkeypatch.setattr(
        y_finance,
        "_get_ticker_info",
        lambda _symbol: {"currency": "IDR", "financialCurrency": "USD", "currentPrice": 2500},
    )

    payload = service.build_stock_overview("ADRO.JK")

    assert payload["currency"] == "IDR"
    assert payload["financial_currency"] == "USD"


def test_get_stock_overview_uses_cache_within_ttl(monkeypatch):
    service.market_cache.clear()
    calls = {"n": 0}

    def fake_build(symbol):
        calls["n"] += 1
        return {"ticker": symbol, "price": 100.0 + calls["n"]}

    monkeypatch.setattr(service, "build_stock_overview", fake_build)

    first = service.get_stock_overview("AAPL")
    second = service.get_stock_overview("AAPL")

    assert first == second
    assert calls["n"] == 1


def test_get_stock_overview_force_refresh_bypasses_cache(monkeypatch):
    service.market_cache.clear()
    calls = {"n": 0}

    def fake_build(symbol):
        calls["n"] += 1
        return {"ticker": symbol, "price": 100.0 + calls["n"]}

    monkeypatch.setattr(service, "build_stock_overview", fake_build)

    service.get_stock_overview("AAPL")
    refreshed = service.get_stock_overview("AAPL", force_refresh=True)

    assert calls["n"] == 2
    assert refreshed["price"] == 102.0


def test_get_stock_overview_coalesces_concurrent_requests(monkeypatch):
    import threading

    service.market_cache.clear()
    calls = {"n": 0}
    release = threading.Event()

    def fake_build(symbol):
        calls["n"] += 1
        release.wait(timeout=2)
        return {"ticker": symbol, "price": 100.0}

    monkeypatch.setattr(service, "build_stock_overview", fake_build)

    results: list[dict] = []
    threads = [
        threading.Thread(target=lambda: results.append(service.get_stock_overview("AAPL")))
        for _ in range(5)
    ]
    for t in threads:
        t.start()
    release.set()
    for t in threads:
        t.join(timeout=5)

    assert calls["n"] == 1
    assert len(results) == 5
    assert all(r == {"ticker": "AAPL", "price": 100.0} for r in results)
