import threading
import time

import pytest

from tradingagents.dataflows.config import get_config, set_config
from tradingagents.dataflows.stockstats_utils import yf_retry
from tradingagents.pipeline_balanced import (
    AnalystReport,
    LLMBudget,
    _date_window,
    _extract_last_close_price,
    _invoke_once,
)
from tradingagents.pipeline_balanced_data import _build_price_chart
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


def test_build_price_chart_filters_window_and_calculates_stats():
    price_data = """# Stock data for TEST
Date,Open,High,Low,Close,Volume
2026-03-01,8,9,7,8.5,500
2026-05-18,10,11,9,10.5,1000
2026-05-19,11,12,10,11.25,1100
2026-05-31,12,13,11,12.5,1200
"""

    chart = _build_price_chart("TEST", "2026-05-30", price_data, 1, source="yfinance")

    assert chart["available"] is True
    assert chart["lookback_days"] == 60
    assert [point["date"] for point in chart["points"]] == ["2026-05-18", "2026-05-19"]
    assert chart["stats"] == {
        "start_price": 10.5,
        "end_price": 11.25,
        "change": 0.75,
        "change_percent": 7.14,
        "high": 12.0,
        "low": 9.0,
        "average_close": 10.88,
        "average_volume": 1050,
        "point_count": 2,
    }


def test_build_price_chart_filters_incomplete_rows_and_sanitizes_high_low():
    price_data = """# Stock data for TEST
Date,Open,High,Low,Close,Volume
2026-05-18,10,9,12,11,1000
2026-05-19,,12,10,11.25,1100
2026-05-20,11,13,10,12,1200
"""

    chart = _build_price_chart("TEST", "2026-05-30", price_data, 1, source="yfinance")

    assert chart["available"] is True
    assert chart["points"] == [
        {
            "date": "2026-05-18",
            "open": 10.0,
            "high": 12.0,
            "low": 9.0,
            "close": 11.0,
            "volume": 1000,
        },
        {
            "date": "2026-05-20",
            "open": 11.0,
            "high": 13.0,
            "low": 10.0,
            "close": 12.0,
            "volume": 1200,
        },
    ]
    assert chart["stats"]["point_count"] == 2
    assert chart["stats"]["high"] == 13.0
    assert chart["stats"]["low"] == 9.0


@pytest.mark.parametrize(("months", "lookback_days"), [(1, 60), (2, 90), (3, 120)])
def test_build_price_chart_uses_horizon_lookback_and_returns_empty_state(months, lookback_days):
    chart = _build_price_chart("TEST", "2026-05-30", "", months)

    assert chart["available"] is False
    assert chart["lookback_days"] == lookback_days
    assert chart["points"] == []
    assert chart["stats"] == {}
    assert chart["warning"] == "Price chart data is unavailable."


def test_date_window_scales_with_time_horizon():
    assert _date_window("2026-05-15", 1) == ("2026-03-16", "2026-04-15", "2026-05-16")
    assert _date_window("2026-05-15", 3) == ("2026-01-15", "2026-02-14", "2026-05-16")


def test_call_with_timeout_returns_without_waiting_for_hung_call():
    started_at = time.monotonic()

    with pytest.raises(TimeoutError):
        call_with_timeout(
            lambda: time.sleep(2),
            timeout_seconds=1,
            service_name="test-hung-call",
        )

    assert time.monotonic() - started_at < 1.8
    assert (
        call_with_timeout(
            lambda: "fast",
            timeout_seconds=1,
            service_name="test-after-hung-call",
        )
        == "fast"
    )


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

    assert (
        call_with_timeout(
            lambda: get_config()["timeout"],
            timeout_seconds=1,
            service_name="test-config-context",
        )
        == 17
    )


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


def test_router_falls_back_when_primary_returns_missing_text(monkeypatch):
    from tradingagents.dataflows import interface

    monkeypatch.setattr(
        interface,
        "get_config",
        lambda: {
            "tool_timeout_seconds": 1,
            "tool_max_retries": 2,
            "cache_ttl_seconds": 1,
            "cache_max_entries": 10,
            "circuit_breaker_failure_threshold": 5,
            "circuit_breaker_recovery_seconds": 60,
        },
    )
    monkeypatch.setattr(interface, "get_vendor", lambda category, method=None: "yfinance,alpha_vantage")
    monkeypatch.setitem(
        interface.VENDOR_METHODS["get_news"], "yfinance", lambda *args, **kwargs: "No news found for TEST"
    )
    monkeypatch.setitem(
        interface.VENDOR_METHODS["get_news"],
        "alpha_vantage",
        lambda *args, **kwargs: "## Alpha Vantage News\n\n### Useful headline",
    )
    monkeypatch.setattr(interface, "call_with_timeout", lambda func, **kwargs: func())
    monkeypatch.setattr(interface, "call_with_retry", lambda func, **kwargs: func())

    result = interface.route_to_vendor("get_news", "TEST_FALLBACK", "2026-05-01", "2026-05-02")

    assert "Useful headline" in result


def test_route_to_all_vendors_returns_every_usable_payload(monkeypatch):
    from tradingagents.dataflows import interface

    monkeypatch.setattr(
        interface,
        "get_config",
        lambda: {
            "tool_timeout_seconds": 1,
            "tool_max_retries": 2,
            "cache_ttl_seconds": 1,
            "cache_max_entries": 10,
            "circuit_breaker_failure_threshold": 5,
            "circuit_breaker_recovery_seconds": 60,
        },
    )
    monkeypatch.setattr(interface, "get_vendor", lambda category, method=None: "yfinance,alpha_vantage")
    monkeypatch.setitem(interface.VENDOR_METHODS["get_news"], "yfinance", lambda *args, **kwargs: "## Yahoo News")
    monkeypatch.setitem(interface.VENDOR_METHODS["get_news"], "alpha_vantage", lambda *args, **kwargs: "## Alpha News")
    monkeypatch.setattr(interface, "call_with_timeout", lambda func, **kwargs: func())
    monkeypatch.setattr(interface, "call_with_retry", lambda func, **kwargs: func())

    result = interface.route_to_all_vendors("get_news", "TEST_ALL", "2026-05-03", "2026-05-04")

    assert result == {"yfinance": "## Yahoo News", "alpha_vantage": "## Alpha News"}


def test_alpha_vantage_stock_normalizes_csv_for_pipeline(monkeypatch):
    from tradingagents.dataflows import alpha_vantage_stock

    raw_csv = "\n".join(
        [
            "timestamp,open,high,low,close,volume",
            "2026-05-14,10,11,9,10.5,1000",
        ]
    )
    monkeypatch.setattr(alpha_vantage_stock, "_make_api_request", lambda function_name, params: raw_csv)

    result = alpha_vantage_stock.get_stock("TEST", "2026-05-14", "2026-05-15")

    assert "Alpha Vantage daily stock data for TEST" in result
    assert "Date,Open,High,Low,Close,Volume" in result
    assert "2026-05-14,10,11,9,10.5,1000" in result


def test_alpha_vantage_news_formats_feed_and_empty_response(monkeypatch):
    from tradingagents.dataflows import alpha_vantage_news

    monkeypatch.setattr(
        alpha_vantage_news,
        "_make_api_request",
        lambda function_name, params: (
            '{"feed":[{"title":"Astra expands","source":"Example","summary":"Expansion summary",'
            '"url":"https://example.com/news","time_published":"20260514T120000"}]}'
        ),
    )

    result = alpha_vantage_news.get_news("ASII.JK", "2026-05-01", "2026-05-15")

    assert "Astra expands" in result
    assert "source: Example" in result
    assert "https://example.com/news" in result

    monkeypatch.setattr(alpha_vantage_news, "_make_api_request", lambda function_name, params: '{"feed":[]}')

    empty = alpha_vantage_news.get_news("ASII.JK", "2026-05-01", "2026-05-15")

    assert empty.startswith("No news found for ASII.JK")


def test_invoke_once_returns_fallback_when_llm_timeout_is_raised():
    class TimeoutLLM:
        def with_structured_output(self, schema):
            return None

        def invoke(self, prompt):
            raise TimeoutError("provider timed out")

    set_config({"timeout": 1})
    fallback = AnalystReport(
        title="Fallback",
        summary="Timed out.",
        key_points=["Timed out."],
        risks=["Timeout"],
        confidence=0.1,
    )

    result = _invoke_once(
        TimeoutLLM(),
        AnalystReport,
        "Prompt",
        fallback,
        "Slow Agent",
    )

    assert result == fallback
