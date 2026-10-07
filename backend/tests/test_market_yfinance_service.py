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

    monkeypatch.setattr(service, "build_stock_overview_with_fallback", fake_build)

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

    monkeypatch.setattr(service, "build_stock_overview_with_fallback", fake_build)

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

    monkeypatch.setattr(service, "build_stock_overview_with_fallback", fake_build)

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


# ── Phase 3: vendor fallback + circuit breaker ────────────────────────────────

import pytest  # noqa: E402

_COMPLETE = {"price": 100.0, "name": "Apple Inc."}


@pytest.fixture()
def fresh_breakers():
    from tradingagents.utils.resilience import get_circuit

    def reset():
        for vendor in ("yfinance", "finnhub", "alpha_vantage"):
            get_circuit(f"stock_overview:{vendor}").record_success()

    reset()
    yield
    reset()


def _trip(vendor: str) -> None:
    from tradingagents.utils.resilience import get_circuit

    breaker = get_circuit(f"stock_overview:{vendor}")
    for _ in range(breaker.failure_threshold):
        breaker.record_failure(RuntimeError("down"))


def test_fallback_uses_yfinance_alone_when_complete(monkeypatch, fresh_breakers):
    monkeypatch.setattr(service, "build_stock_overview", lambda s: {"ticker": s, **_COMPLETE})
    called = []
    monkeypatch.setattr(service, "_build_stock_overview_from_finnhub", lambda s: called.append(s))

    result = service.build_stock_overview_with_fallback("AAPL")

    assert result["price"] == 100.0
    assert called == []


def test_fallback_fills_gaps_from_finnhub_without_overwriting(monkeypatch, fresh_breakers):
    monkeypatch.setattr(
        service,
        "build_stock_overview",
        lambda s: {"ticker": s, "price": 99.0, "name": None, "sector": "Tech"},
    )
    monkeypatch.setattr(
        service,
        "_build_stock_overview_from_finnhub",
        lambda s: {"price": 101.5, "name": "Apple Inc.", "sector": "Other"},
    )

    result = service.build_stock_overview_with_fallback("AAPL")

    assert result["price"] == 99.0  # yfinance wins when it has a value
    assert result["name"] == "Apple Inc."  # gap filled
    assert result["sector"] == "Tech"


def test_fallback_continues_to_alpha_vantage(monkeypatch, fresh_breakers):
    monkeypatch.setattr(service, "build_stock_overview", lambda s: {"ticker": s, "price": None})
    monkeypatch.setattr(service, "_build_stock_overview_from_finnhub", lambda s: {})
    monkeypatch.setattr(service, "_build_stock_overview_from_alpha_vantage", lambda s: _COMPLETE)

    assert service.build_stock_overview_with_fallback("AAPL")["name"] == "Apple Inc."


def test_fallback_skips_open_circuit_without_calling_vendor(monkeypatch, fresh_breakers):
    yf_calls = []

    def yf_build(symbol):
        yf_calls.append(symbol)
        raise RuntimeError("yfinance down")

    monkeypatch.setattr(service, "build_stock_overview", yf_build)
    monkeypatch.setattr(service, "_build_stock_overview_from_finnhub", lambda s: _COMPLETE)
    _trip("yfinance")

    result = service.build_stock_overview_with_fallback("AAPL")

    assert yf_calls == []  # breaker open: yfinance never attempted
    assert result["price"] == 100.0


def test_try_vendor_opens_breaker_after_threshold_failures(monkeypatch, fresh_breakers):
    from tradingagents.utils.resilience import get_circuit

    attempts = []

    def boom():
        attempts.append(1)
        raise RuntimeError("down")

    for _ in range(8):
        assert service._try_vendor("finnhub", boom) is None

    assert len(attempts) == get_circuit("stock_overview:finnhub").failure_threshold


def test_fallback_never_raises_when_every_vendor_fails(monkeypatch, fresh_breakers):
    def boom(_symbol):
        raise RuntimeError("down")

    monkeypatch.setattr(service, "build_stock_overview", boom)
    monkeypatch.setattr(service, "_build_stock_overview_from_finnhub", boom)
    monkeypatch.setattr(service, "_build_stock_overview_from_alpha_vantage", boom)

    assert service.build_stock_overview_with_fallback("AAPL")["ticker"] == "AAPL"


def test_get_stock_overview_uses_fallback_builder(monkeypatch, fresh_breakers):
    service.market_cache.clear()
    monkeypatch.setattr(
        service, "build_stock_overview_with_fallback", lambda s: {"ticker": s, "price": 1.0}
    )

    assert service.get_stock_overview("ZZZ")["price"] == 1.0


def test_finnhub_adapter_maps_profile_and_quote(monkeypatch):
    import tradingagents.dataflows.providers.finnhub_common as fc

    def fake_request(endpoint, params=None, **_kw):
        if endpoint == "/quote":
            return {"c": 101.5, "pc": 100.0, "o": 100.5, "h": 102.0, "l": 99.0}
        return {
            "name": "Apple Inc",
            "finnhubIndustry": "Technology",
            "exchange": "NASDAQ",
            "currency": "USD",
            "marketCapitalization": 3_000_000.0,  # Finnhub reports millions
        }

    monkeypatch.setattr(fc, "make_api_request", fake_request)

    result = service._build_stock_overview_from_finnhub("AAPL")

    assert result["price"] == 101.5
    assert result["prev_close"] == 100.0
    assert result["name"] == "Apple Inc"
    assert result["market_cap"] == 3_000_000_000_000.0


def test_alpha_vantage_adapter_maps_overview_and_quote(monkeypatch):
    import tradingagents.dataflows.providers.alpha_vantage_common as av

    def fake_request(function_name, params):
        if function_name == "GLOBAL_QUOTE":
            return {"Global Quote": {"05. price": "101.50", "08. previous close": "100.00"}}
        return {
            "Name": "Apple Inc",
            "Sector": "TECHNOLOGY",
            "MarketCapitalization": "3000000000000",
        }

    monkeypatch.setattr(av, "_make_api_request", fake_request)

    result = service._build_stock_overview_from_alpha_vantage("AAPL")

    assert result["price"] == 101.5
    assert result["name"] == "Apple Inc"
    assert result["market_cap"] == 3e12


def test_fallback_marks_complete_when_required_fields_present(monkeypatch, fresh_breakers):
    monkeypatch.setattr(service, "build_stock_overview", lambda s: {"ticker": s, **_COMPLETE})

    assert service.build_stock_overview_with_fallback("AAPL")["data_quality"] == "complete"


def test_fallback_marks_unavailable_when_nothing_usable(monkeypatch, fresh_breakers):
    monkeypatch.setattr(service, "build_stock_overview", lambda s: {"ticker": s, "price": None})
    monkeypatch.setattr(service, "_build_stock_overview_from_finnhub", lambda s: None)
    monkeypatch.setattr(service, "_build_stock_overview_from_alpha_vantage", lambda s: None)

    assert service.build_stock_overview_with_fallback("AAPL")["data_quality"] == "unavailable"


def test_fallback_marks_unavailable_when_every_vendor_raises(monkeypatch, fresh_breakers):
    def boom(_symbol):
        raise RuntimeError("down")

    monkeypatch.setattr(service, "build_stock_overview", boom)
    monkeypatch.setattr(service, "_build_stock_overview_from_finnhub", boom)
    monkeypatch.setattr(service, "_build_stock_overview_from_alpha_vantage", boom)

    assert service.build_stock_overview_with_fallback("AAPL")["data_quality"] == "unavailable"


def test_fallback_marks_partial_when_only_price_found(monkeypatch, fresh_breakers):
    monkeypatch.setattr(service, "build_stock_overview", lambda s: None)
    monkeypatch.setattr(service, "_build_stock_overview_from_finnhub", lambda s: {"price": 100.0})
    monkeypatch.setattr(service, "_build_stock_overview_from_alpha_vantage", lambda s: None)

    assert service.build_stock_overview_with_fallback("AAPL")["data_quality"] == "partial"


# ── Phase 5: quote-lite + fundamentals TTL ────────────────────────────────────


def test_get_quote_lite_cached_uses_short_ttl_cache(monkeypatch):
    service.market_cache.clear()
    calls = {"n": 0}

    def fake_fetch_quote(symbol):
        calls["n"] += 1
        return {"sym": symbol, "price": 100.0 + calls["n"], "error": False}

    monkeypatch.setattr(service, "_fetch_quote", fake_fetch_quote)

    first = service.get_quote_lite_cached("AAPL")
    second = service.get_quote_lite_cached("AAPL")

    assert first == second
    assert calls["n"] == 1
    assert service.QUOTE_LITE_TTL_SECONDS < 30


def test_fundamentals_use_long_ttl_and_fundamentals_cache_key(monkeypatch):
    service.market_cache.clear()
    monkeypatch.setattr(
        service,
        "build_stock_overview_with_fallback",
        lambda s: {"ticker": s, "price": 1.0, "name": "X", "data_quality": "complete"},
    )

    service.get_stock_overview("ZZZ")

    ttl = service.market_cache._items["fundamentals:ZZZ"][1]
    assert ttl == service.FUNDAMENTALS_TTL_SECONDS == 900


def test_degraded_fundamentals_are_cached_briefly_not_for_fifteen_minutes(monkeypatch):
    service.market_cache.clear()
    monkeypatch.setattr(
        service,
        "build_stock_overview_with_fallback",
        lambda s: {"ticker": s, "price": None, "name": None, "data_quality": "unavailable"},
    )

    service.get_stock_overview("ZZZ")

    ttl = service.market_cache._items["fundamentals:ZZZ"][1]
    assert ttl == service.DEGRADED_FUNDAMENTALS_TTL_SECONDS < service.FUNDAMENTALS_TTL_SECONDS


def test_get_stock_overview_force_refresh_invalidates_engine_info_cache(monkeypatch):
    from tradingagents.dataflows.providers import y_finance

    service.market_cache.clear()
    y_finance._get_ticker_info.cache_clear()
    fetches = []

    def fake_ticker(_symbol):
        fetches.append(1)
        return type("T", (), {"info": {"currentPrice": len(fetches)}})()

    monkeypatch.setattr(y_finance, "_get_ticker", fake_ticker)
    monkeypatch.setattr(service, "build_stock_overview_with_fallback", lambda s: {"ticker": s})

    service.get_stock_overview("ZZZ")
    y_finance._get_ticker_info("ZZZ")
    y_finance._get_ticker_info("ZZZ")
    assert len(fetches) == 1
    service.get_stock_overview("ZZZ", force_refresh=True)
    y_finance._get_ticker_info("ZZZ")
    assert len(fetches) == 2
    y_finance._get_ticker_info.cache_clear()


def test_build_stock_overview_dividend_yield_is_a_fraction(monkeypatch):
    from tradingagents.dataflows.providers import y_finance

    info = {"currentPrice": 200.0, "dividendRate": 1.0, "dividendYield": 0.5}
    monkeypatch.setattr(y_finance, "_get_ticker_info", lambda _s: info)

    assert service.build_stock_overview("AAPL")["dividend_yield"] == 0.005
    info.pop("dividendRate")
    assert service.build_stock_overview("AAPL")["dividend_yield"] is None
