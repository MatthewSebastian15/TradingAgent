import threading
import time

import pytest

from tradingagents.dataflows.config import get_config
from tradingagents.pipeline_balanced import (
    AnalystReport,
    LLMBudget,
    _extract_last_close_price,
    _invoke_once,
)
from tradingagents.dataflows.config import set_config
from tradingagents.dataflows.stockstats_utils import yf_retry
from tradingagents.utils_resilience import CircuitBreaker, CircuitOpenError, call_with_timeout, get_timeout_stats


def test_llm_budget_records_exhaustion_and_skipped_agents():
    budget = LLMBudget(limit=1)

    assert budget.consume("Market Analyst") is True
    assert budget.consume("News Analyst") is False
    assert budget.consume("Portfolio Manager") is False

    snapshot = budget.snapshot()
    assert snapshot["used"] == 1
    assert snapshot["limit"] == 1
    assert snapshot["budget_exhausted"] is True
    assert snapshot["agents_skipped"] == ["News Analyst", "Portfolio Manager"]


def test_extract_last_close_price_uses_last_row_at_or_before_trade_date():
    price_data = """# Stock data for TEST
# Total records: 3

Date,Open,High,Low,Close,Volume
2026-05-18,10,11,9,10.5,1000
2026-05-19,11,12,10,11.25,1100
2026-05-21,12,13,11,12.5,1200
"""

    assert _extract_last_close_price(price_data, "2026-05-20") == 11.25


def test_call_with_timeout_returns_without_waiting_for_hung_call():
    started_at = time.monotonic()

    with pytest.raises(TimeoutError):
        call_with_timeout(
            lambda: time.sleep(2),
            timeout_seconds=1,
            service_name="test-hung-call",
        )

    assert time.monotonic() - started_at < 1.8
    assert call_with_timeout(
        lambda: "fast",
        timeout_seconds=1,
        service_name="test-after-hung-call",
    ) == "fast"


def test_call_with_timeout_releases_active_capacity_after_timeout():
    done = threading.Event()

    def slow_call():
        try:
            time.sleep(0.2)
        finally:
            done.set()

    before = get_timeout_stats()

    with pytest.raises(TimeoutError):
        call_with_timeout(
            slow_call,
            timeout_seconds=0.05,
            service_name="test-active-capacity-release",
        )

    after_timeout = get_timeout_stats()
    assert after_timeout["active_calls"] == before["active_calls"]
    assert after_timeout["abandoned_calls"] >= before["abandoned_calls"] + 1

    assert done.wait(1)
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline:
        if get_timeout_stats()["abandoned_calls"] <= before["abandoned_calls"]:
            break
        time.sleep(0.01)

    assert get_timeout_stats()["abandoned_calls"] <= before["abandoned_calls"]


def test_config_scope_propagates_into_timeout_worker():
    set_config({"timeout": 17})

    assert call_with_timeout(
        lambda: get_config()["timeout"],
        timeout_seconds=1,
        service_name="test-config-context",
    ) == 17


def test_circuit_breaker_allows_only_one_half_open_probe():
    circuit = CircuitBreaker("test-half-open-single-probe", failure_threshold=2, recovery_seconds=1)
    circuit.record_failure(RuntimeError("first failure"))
    circuit.record_failure(RuntimeError("second failure"))
    with circuit._lock:
        circuit._state.opened_at = time.monotonic() - 2

    circuit.before_call()
    with pytest.raises(CircuitOpenError):
        circuit.before_call()

    circuit.record_success()
    circuit.before_call()


def test_circuit_breaker_reopens_after_failed_half_open_probe():
    circuit = CircuitBreaker("test-half-open-failure", failure_threshold=2, recovery_seconds=1)
    circuit.record_failure(RuntimeError("first failure"))
    circuit.record_failure(RuntimeError("second failure"))
    with circuit._lock:
        circuit._state.opened_at = time.monotonic() - 2

    circuit.before_call()
    circuit.record_failure(RuntimeError("probe failed"))

    with pytest.raises(CircuitOpenError):
        circuit.before_call()


def test_yf_retry_retries_timeout_errors():
    attempts = {"count": 0}

    def flaky_call():
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise TimeoutError("temporary network timeout")
        return "ok"

    assert yf_retry(flaky_call, max_retries=1, base_delay=0) == "ok"
    assert attempts["count"] == 2


def test_alpha_vantage_requests_use_native_timeout(monkeypatch):
    from tradingagents.dataflows import alpha_vantage_common

    set_config({"tool_timeout_seconds": 7})
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "alpha-test-key")
    captured = {}

    class Response:
        text = "{}"

        def raise_for_status(self):
            return None

    def fake_get(url, params, timeout):
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(alpha_vantage_common.requests, "get", fake_get)

    assert alpha_vantage_common._make_api_request("TIME_SERIES_DAILY", {"symbol": "AAPL"}) == "{}"
    assert captured["timeout"] == (5, 7)
    assert captured["params"]["apikey"] == "alpha-test-key"


def test_yfinance_router_uses_single_app_retry_layer(monkeypatch):
    from tradingagents.dataflows import interface

    attempts = []

    monkeypatch.setattr(
        interface,
        "get_config",
        lambda: {
            "tool_timeout_seconds": 1,
            "tool_max_retries": 5,
            "cache_ttl_seconds": 1,
            "cache_max_entries": 10,
            "circuit_breaker_failure_threshold": 5,
            "circuit_breaker_recovery_seconds": 60,
        },
    )
    monkeypatch.setattr(interface, "get_vendor", lambda category, method=None: "yfinance")
    monkeypatch.setitem(interface.VENDOR_METHODS["get_stock_data"], "yfinance", lambda *args, **kwargs: "ok")
    monkeypatch.setattr(interface, "call_with_timeout", lambda func, **kwargs: func())

    def fake_retry(func, **kwargs):
        attempts.append(kwargs["max_attempts"])
        return func()

    monkeypatch.setattr(interface, "call_with_retry", fake_retry)

    assert interface.route_to_vendor("get_stock_data", "AAPL", "2026-05-01", "2026-05-02") == "ok"
    assert attempts == [1]


def test_invoke_once_uses_timeout_and_returns_fallback():
    class SlowLLM:
        def with_structured_output(self, schema):
            return None

        def invoke(self, prompt):
            time.sleep(2)
            return "{}"

    set_config({"timeout": 1})
    fallback = AnalystReport(
        title="Fallback",
        summary="Timed out.",
        key_points=["Timed out."],
        risks=["Timeout"],
        confidence=0.1,
    )

    started_at = time.monotonic()
    result = _invoke_once(
        SlowLLM(),
        AnalystReport,
        "Prompt",
        fallback,
        "Slow Agent",
    )

    assert result == fallback
    assert time.monotonic() - started_at < 1.8
