import time

import pytest

from tradingagents.pipeline_balanced import (
    AnalystReport,
    LLMBudget,
    _extract_last_close_price,
    _invoke_once,
)
from tradingagents.dataflows.config import set_config
from tradingagents.dataflows.stockstats_utils import yf_retry
from tradingagents.utils_resilience import call_with_timeout


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


def test_yf_retry_retries_timeout_errors():
    attempts = {"count": 0}

    def flaky_call():
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise TimeoutError("temporary network timeout")
        return "ok"

    assert yf_retry(flaky_call, max_retries=1, base_delay=0) == "ok"
    assert attempts["count"] == 2


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
