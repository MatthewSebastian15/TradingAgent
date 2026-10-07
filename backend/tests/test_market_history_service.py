from __future__ import annotations

import sys
from types import SimpleNamespace

import pandas as pd
import pytest

import routes.market as market_routes
from services.market import history_service as svc


def _patch_ticker(monkeypatch, **attrs):
    """Install a fake yfinance whose Ticker(...) exposes *attrs* (as in real yfinance)."""
    fake_yf = SimpleNamespace(Ticker=lambda _symbol: SimpleNamespace(**attrs))
    monkeypatch.setitem(
        sys.modules,
        "tradingagents.dataflows.providers.yfinance_runtime",
        SimpleNamespace(yf=fake_yf),
    )


@pytest.fixture(autouse=True)
def _clean_cache():
    svc.market_cache.clear()
    yield
    svc.market_cache.clear()


# ── analyst history ───────────────────────────────────────────────────────────


def test_analyst_history_maps_columns_and_runs_oldest_to_newest(monkeypatch):
    frame = pd.DataFrame(
        [
            {"period": "0m", "strongBuy": 6, "buy": 19, "hold": 13, "sell": 3, "strongSell": 3},
            {"period": "-1m", "strongBuy": 5, "buy": 18, "hold": 14, "sell": 3, "strongSell": 2},
        ]
    )
    _patch_ticker(monkeypatch, recommendations=frame)

    result = svc.get_analyst_history_cached("AAPL")

    assert result["ticker"] == "AAPL"
    assert [row["period"] for row in result["history"]] == ["-1m", "0m"]
    assert result["history"][-1] == {
        "period": "0m",
        "strong_buy": 6.0,
        "buy": 19.0,
        "hold": 13.0,
        "sell": 3.0,
        "strong_sell": 3.0,
    }


def test_analyst_history_is_empty_when_no_coverage(monkeypatch):
    _patch_ticker(monkeypatch, recommendations=pd.DataFrame())

    assert svc.get_analyst_history_cached("TINY")["history"] == []


def test_analyst_history_survives_a_vendor_exception(monkeypatch):
    def boom(_symbol):
        raise RuntimeError("yfinance changed shape")

    monkeypatch.setitem(
        sys.modules,
        "tradingagents.dataflows.providers.yfinance_runtime",
        SimpleNamespace(yf=SimpleNamespace(Ticker=boom)),
    )

    assert svc.get_analyst_history_cached("AAPL") == {"ticker": "AAPL", "history": []}


# ── growth trend ──────────────────────────────────────────────────────────────


def _income_stmt(quarters: int) -> pd.DataFrame:
    # Real yfinance orientation: rows = line items, columns = period end dates, newest first.
    dates = list(pd.date_range("2025-03-31", periods=quarters, freq="QE"))[::-1]
    return pd.DataFrame(
        {
            d: {"Total Revenue": 1000.0 + i, "Net Income": 100.0 + i}
            for i, d in enumerate(reversed(dates))
        }
    )[dates]


def test_growth_trend_returns_oldest_first_and_caps_to_eight_quarters(monkeypatch):
    _patch_ticker(monkeypatch, quarterly_income_stmt=_income_stmt(10))

    result = svc.get_growth_trend_cached("AAPL")

    assert len(result["quarters"]) == 8
    periods = [q["period"] for q in result["quarters"]]
    assert periods == sorted(periods)
    assert result["quarters"][-1]["revenue"] == 1009.0
    assert result["quarters"][-1]["earnings"] == 109.0


def test_growth_trend_tolerates_missing_rows(monkeypatch):
    frame = pd.DataFrame({pd.Timestamp("2025-06-30"): {"Total Revenue": 50.0}})
    _patch_ticker(monkeypatch, quarterly_income_stmt=frame)

    quarter = svc.get_growth_trend_cached("AAPL")["quarters"][0]

    assert quarter == {"period": "2025-06-30", "revenue": 50.0, "earnings": None}


def test_growth_trend_is_empty_without_statements(monkeypatch):
    _patch_ticker(monkeypatch, quarterly_income_stmt=pd.DataFrame())

    assert svc.get_growth_trend_cached("AAPL")["quarters"] == []


# ── dividend history ──────────────────────────────────────────────────────────


def test_dividend_history_keeps_the_last_twelve_payments_oldest_first(monkeypatch):
    dates = pd.date_range("2020-01-01", periods=20, freq="QE", tz="America/New_York")
    _patch_ticker(monkeypatch, dividends=pd.Series(range(20), index=dates, dtype=float))

    payments = svc.get_dividend_history_cached("AAPL")["payments"]

    assert len(payments) == 12
    assert payments[-1]["amount"] == 19.0
    assert payments[0]["amount"] == 8.0
    assert payments[-1]["date"] == dates[-1].strftime("%Y-%m-%d")


def test_dividend_history_is_empty_for_non_payers(monkeypatch):
    _patch_ticker(monkeypatch, dividends=pd.Series([], dtype=float))

    assert svc.get_dividend_history_cached("TSLA")["payments"] == []


# ── caching ───────────────────────────────────────────────────────────────────


def test_history_results_use_long_ttls_and_empty_ones_a_short_one(monkeypatch):
    frame = pd.DataFrame(
        [{"period": "0m", "strongBuy": 1, "buy": 1, "hold": 1, "sell": 1, "strongSell": 1}]
    )
    _patch_ticker(monkeypatch, recommendations=frame, dividends=pd.Series([], dtype=float))

    svc.get_analyst_history_cached("AAPL")
    svc.get_dividend_history_cached("AAPL")

    items = svc.market_cache._items
    assert items["analyst_history:AAPL"][1] == svc.ANALYST_HISTORY_TTL_SECONDS == 3600
    assert items["dividend_history:AAPL"][1] == svc.DEGRADED_HISTORY_TTL_SECONDS


def test_history_is_fetched_once_within_the_ttl(monkeypatch):
    calls = {"n": 0}
    frame = pd.DataFrame(
        [{"period": "0m", "strongBuy": 1, "buy": 1, "hold": 1, "sell": 1, "strongSell": 1}]
    )

    def ticker(_symbol):
        calls["n"] += 1
        return SimpleNamespace(recommendations=frame)

    monkeypatch.setitem(
        sys.modules,
        "tradingagents.dataflows.providers.yfinance_runtime",
        SimpleNamespace(yf=SimpleNamespace(Ticker=ticker)),
    )

    svc.get_analyst_history_cached("AAPL")
    svc.get_analyst_history_cached("AAPL")

    assert calls["n"] == 1


# ── routes ────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("path", "attr", "payload"),
    [
        ("analyst-history", "get_analyst_history_cached", {"history": []}),
        ("growth-trend", "get_growth_trend_cached", {"quarters": []}),
        ("dividend-history", "get_dividend_history_cached", {"payments": []}),
    ],
)
def test_history_routes_forward_validate_and_reject_bad_tickers(
    client, monkeypatch, path, attr, payload
):
    seen: list[str] = []
    monkeypatch.setattr(market_routes, attr, lambda symbol: seen.append(symbol) or payload)

    ok = client.get(f"/api/market/{path}?ticker=aapl")

    assert ok.status_code == 200
    assert ok.json() == payload
    assert seen == ["AAPL"]
    assert client.get(f"/api/market/{path}?ticker=AAPL;DROP").status_code == 400
