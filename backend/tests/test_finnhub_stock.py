from __future__ import annotations

from tradingagents.dataflows.finnhub_stock import get_quote, get_stock, get_stock_ohlcv


def test_get_quote_success_normalizes_fields(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_stock.make_api_request",
        lambda *a, **k: {"c": 100, "pc": 95, "o": 97, "h": 101, "l": 96, "t": 1},
    )
    quote = get_quote("AAPL")
    assert quote["current_price"] == 100
    assert quote["source"] == "finnhub"


def test_get_quote_zero_current_price_unavailable(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_stock.make_api_request", lambda *a, **k: {"c": 0, "pc": 95}
    )
    try:
        get_quote("AAPL")
    except Exception as exc:
        assert "missing or zero" in str(exc)


def test_get_quote_missing_previous_close_partial_confidence(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_stock.make_api_request",
        lambda *a, **k: {"c": 100, "pc": None},
    )
    quote = get_quote("AAPL")
    assert quote["metadata"]["quality"]["confidence"] == "medium"


def test_get_stock_success_returns_csv(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_stock.make_api_request",
        lambda *a, **k: {
            "s": "ok",
            "t": [1779840000],
            "o": [1],
            "h": [2],
            "l": [1],
            "c": [2],
            "v": [100],
        },
    )
    assert "Date,Open,High,Low,Close,Volume" in get_stock("AAPL", "2026-05-26", "2026-05-28")


def test_get_stock_object_schema(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_stock.make_api_request",
        lambda *a, **k: {
            "s": "ok",
            "t": [1779840000],
            "o": [1],
            "h": [2],
            "l": [1],
            "c": [2],
            "v": [100],
        },
    )
    payload = get_stock_ohlcv("AAPL", "2026-05-26", "2026-05-28")
    assert payload["rows"][0]["close"] == 2
    assert payload["timeframe"] == "1d"


def test_get_stock_no_data_status_unavailable(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_stock.make_api_request", lambda *a, **k: {"s": "no_data"}
    )
    text = get_stock("AAPL", "2026-05-26", "2026-05-28")
    assert text.lower().startswith("finnhub unavailable")
