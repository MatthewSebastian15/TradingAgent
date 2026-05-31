from __future__ import annotations

import sys
from types import SimpleNamespace

class _YFRateLimitError(Exception):
    pass

yf_module = SimpleNamespace(Ticker=lambda *a, **k: None)
yf_exceptions = SimpleNamespace(YFRateLimitError=_YFRateLimitError)
sys.modules.setdefault("yfinance", yf_module)
sys.modules.setdefault("yfinance.exceptions", yf_exceptions)
sys.modules.setdefault("stockstats", SimpleNamespace(wrap=lambda df: df))

from tradingagents.dataflows.config import use_config
from tradingagents.dataflows.interface import route_to_vendor
from tradingagents.dataflows.vendor_budget import VendorBudget
from tradingagents.dataflows.vendor_router import VendorAttemptRecorder
import pytest


@pytest.fixture(autouse=True)
def clear_interface_cache():
    from tradingagents.dataflows import interface

    interface._TOOL_CACHE._data.clear()
    yield
    interface._TOOL_CACHE._data.clear()


BASE_CONFIG = {
    "data_vendors": {"quote_data": "yfinance,finnhub,alpha_vantage", "core_stock_apis": "yfinance,finnhub,alpha_vantage"},
    "data_vendor_enable_finnhub_fallback": True,
    "data_vendor_enable_finnhub_enrichment": True,
    "tool_max_retries": 1,
    "tool_timeout_seconds": 5,
    "finnhub": {"enabled": True, "api_key": "test", "enable_stock_data": True},
}


def _quote(source: str, price: float = 10) -> dict:
    return {"source": source, "current_price": price, "previous_close": price - 1, "timestamp": "2026-05-28"}


def test_vendor_attempts_records_success_and_failure(monkeypatch):
    from tradingagents.dataflows import interface
    from tradingagents.dataflows import vendor_router

    recorder = VendorAttemptRecorder()
    monkeypatch.setattr(vendor_router, "get_attempt_recorder", lambda _id: recorder)
    monkeypatch.setattr(interface, "get_attempt_recorder", lambda _id: recorder)
    monkeypatch.setitem(interface.VENDOR_METHODS, "get_quote", {"yfinance": lambda *a, **k: _quote("yfinance")})
    with use_config({**BASE_CONFIG, "_vendor_attempt_recorder_id": "x"}):
        route_to_vendor("get_quote", "AAPL", "2026-05-28")
    assert recorder.get_summary()["quote"] == ["yfinance:success"]


def test_yfinance_empty_finnhub_fallback_called(monkeypatch):
    from tradingagents.dataflows import interface

    calls = []
    monkeypatch.setitem(
        interface.VENDOR_METHODS,
        "get_quote",
        {
            "yfinance": lambda *a, **k: calls.append("yfinance") or {"available": False, "source": "yfinance"},
            "finnhub": lambda *a, **k: calls.append("finnhub") or _quote("finnhub"),
        },
    )
    with use_config(BASE_CONFIG):
        assert route_to_vendor("get_quote", "AAPL", "2026-05-28")["source"] == "finnhub"
    assert calls == ["yfinance", "finnhub"]


def test_all_vendors_failed_returns_clear_error(monkeypatch):
    from tradingagents.dataflows import interface

    monkeypatch.setitem(interface.VENDOR_METHODS, "get_quote", {"yfinance": lambda *a, **k: {"available": False, "source": "yfinance"}})
    with use_config(BASE_CONFIG):
        result = route_to_vendor("get_quote", "AAPL", "2026-05-28")
    assert result["available"] is False


def test_request_budget_stops_extra_calls():
    budget = VendorBudget(max_total_calls=1, per_vendor_limits={"finnhub": 1})
    assert budget.can_call("finnhub") is True
    budget.record_call("finnhub", "get_quote")
    assert budget.can_call("finnhub") is False


def test_company_profile_routes_to_yfinance(monkeypatch):
    from tradingagents.dataflows import interface

    monkeypatch.setitem(
        interface.VENDOR_METHODS,
        "get_company_profile",
        {"yfinance": lambda ticker, _curr_date=None: {"available": True, "ticker": ticker}},
    )

    with use_config(BASE_CONFIG):
        result = route_to_vendor("get_company_profile", "BBCA.JK")

    assert result == {"available": True, "ticker": "BBCA.JK"}
