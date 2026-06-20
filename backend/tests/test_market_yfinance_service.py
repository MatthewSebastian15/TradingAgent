from __future__ import annotations

from services import market_yfinance_service as service


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
