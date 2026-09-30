from __future__ import annotations

from tradingagents.dataflows.providers import interface, y_finance
from tradingagents.dataflows.providers.config import set_config


class _FakeTicker:
    def __init__(self, info: dict, fast_info: dict):
        self._info = info
        self.fast_info = fast_info

    def get_info(self):
        return self._info


def test_live_quote_uses_regular_market_fields(monkeypatch):
    info = {
        "regularMarketPrice": 9150.0,
        "regularMarketPreviousClose": 9100.0,
        "regularMarketTime": 1789372800,
        "marketState": "REGULAR",
        "exchangeDataDelayedBy": 10,
        "currency": "IDR",
    }
    monkeypatch.setattr(y_finance.yf, "Ticker", lambda symbol: _FakeTicker(info, {}))

    quote = y_finance.get_live_quote("BBCA.JK")

    assert quote["current_price"] == 9150.0
    assert quote["previous_close"] == 9100.0
    assert quote["market_state"] == "open"
    assert quote["delay_minutes"] == 10
    assert quote["timestamp"].startswith("2026-09-14")
    assert quote["timestamp_is_fetch_time"] is False
    assert quote["source"] == "yfinance:live_quote"


def test_live_quote_falls_back_to_fast_info_with_fetch_time(monkeypatch):
    fast_info = {"last_price": 101.5, "previous_close": 100.0}
    monkeypatch.setattr(y_finance.yf, "Ticker", lambda symbol: _FakeTicker({}, fast_info))

    quote = y_finance.get_live_quote("AAPL")

    assert quote["current_price"] == 101.5
    assert quote["timestamp_is_fetch_time"] is True
    assert quote["timestamp"] == quote["fetched_at"]
    assert quote["market_state"] is None


def test_route_to_vendor_never_caches_live_quote(monkeypatch):
    set_config({})
    calls = {"count": 0}

    def fake_quote(symbol, curr_date=None):
        calls["count"] += 1
        return {
            "symbol": symbol,
            "source": "yfinance:live_quote",
            "current_price": 100.0 + calls["count"],
            "previous_close": 100.0,
            "timestamp": "2026-09-14T03:00:00+00:00",
        }

    monkeypatch.setitem(interface.VENDOR_METHODS["get_live_quote"], "yfinance", fake_quote)

    first = interface.route_to_vendor("get_live_quote", "AAPL", vendor_order=["yfinance"])
    second = interface.route_to_vendor("get_live_quote", "AAPL", vendor_order=["yfinance"])

    assert calls["count"] == 2
    assert first["current_price"] != second["current_price"]
