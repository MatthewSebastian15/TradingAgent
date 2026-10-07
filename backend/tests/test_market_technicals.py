from __future__ import annotations

import routes.market as market_routes
from services.market import technicals_service as svc


def test_get_technicals_builds_from_one_year_of_daily_ohlcv(monkeypatch):
    svc.market_cache.clear()
    seen = {}

    def fake_ohlcv(symbol, range_key, trade_date):
        seen["ohlcv"] = (symbol, range_key, trade_date)
        return {"points": [{"date": "2024-01-02", "close": 100}]}

    def fake_entry(ohlcv):
        seen["entry_input"] = ohlcv
        return {"available": True, "rsi": 55.0, "trend": "uptrend"}

    monkeypatch.setattr(svc, "fetch_ohlcv_range", fake_ohlcv)
    monkeypatch.setattr(svc, "build_technical_entry", fake_entry)

    result = svc.get_technicals_cached("AAPL")

    assert result["rsi"] == 55.0
    assert seen["ohlcv"] == ("AAPL", "1Y", None)  # 1Y so SMA200 has enough history
    assert seen["entry_input"] == {"points": [{"date": "2024-01-02", "close": 100}]}


def test_get_technicals_is_cached(monkeypatch):
    svc.market_cache.clear()
    calls = {"n": 0}

    def fake_ohlcv(*_a):
        calls["n"] += 1
        return {"points": []}

    monkeypatch.setattr(svc, "fetch_ohlcv_range", fake_ohlcv)
    monkeypatch.setattr(svc, "build_technical_entry", lambda _o: {"available": True})

    svc.get_technicals_cached("AAPL")
    svc.get_technicals_cached("AAPL")

    assert calls["n"] == 1
    assert svc.market_cache._items["technicals:AAPL"][1] == svc.TECHNICALS_TTL_SECONDS == 300


def test_unavailable_technicals_are_cached_briefly(monkeypatch):
    svc.market_cache.clear()
    monkeypatch.setattr(svc, "fetch_ohlcv_range", lambda *_a: {"points": []})
    monkeypatch.setattr(svc, "build_technical_entry", lambda _o: {"available": False})

    svc.get_technicals_cached("AAPL")

    assert svc.market_cache._items["technicals:AAPL"][1] == svc.DEGRADED_TECHNICALS_TTL_SECONDS


def test_technicals_route_forwards_and_validates(client, monkeypatch):
    seen = []
    monkeypatch.setattr(
        market_routes,
        "get_technicals_cached",
        lambda symbol: seen.append(symbol) or {"available": True},
    )

    assert client.get("/api/market/technicals?ticker=aapl").status_code == 200
    assert seen == ["AAPL"]
    assert client.get("/api/market/technicals?ticker=AAPL;DROP").status_code == 400
