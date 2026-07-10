from types import SimpleNamespace


def test_yfinance_ticker_cache_evicts_oldest_symbol(monkeypatch):
    from tradingagents.dataflows.providers import y_finance

    created = []

    def fake_ticker(symbol):
        created.append(symbol)
        return {"symbol": symbol}

    monkeypatch.setattr(y_finance, "yf", SimpleNamespace(Ticker=fake_ticker))
    monkeypatch.setattr(y_finance, "_TICKER_CACHE_MAX_ENTRIES", 2)
    y_finance._ticker_cache.clear()

    y_finance._get_ticker("AAA")
    y_finance._get_ticker("BBB")
    y_finance._get_ticker("AAA")
    y_finance._get_ticker("CCC")

    assert list(y_finance._ticker_cache.keys()) == ["AAA", "CCC"]
    assert created == ["AAA", "BBB", "CCC"]
