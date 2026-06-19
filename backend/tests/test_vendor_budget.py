from __future__ import annotations

from tradingagents.dataflows.providers.config import use_config
from tradingagents.dataflows.providers.vendor_budget import (
    DEFAULT_VENDOR_BUDGET,
    VendorBudget,
    create_budget_from_config,
)
from tradingagents.pipeline_balanced_types import LLMBudget


def test_vendor_budget_counts_all_active_vendors():
    _, budget = create_budget_from_config({"data_vendor_max_calls_per_analysis": 25})

    summary = budget.get_summary()

    assert summary["data_calls"]["max"] == 25
    assert set(DEFAULT_VENDOR_BUDGET["per_vendor"]).issubset(summary["data_calls"]["per_vendor"])


def test_vendor_budget_default_allows_full_analysis_batch():
    _, budget = create_budget_from_config({})

    summary = budget.get_summary()

    assert summary["data_calls"]["max"] == 60
    assert summary["data_calls"]["per_vendor"]["yfinance"]["limit"] >= 24


def test_cache_hit_does_not_count_as_vendor_call(monkeypatch):
    from tradingagents.dataflows.providers import interface

    budget = VendorBudget(max_total_calls=10, per_vendor_limits={"yfinance": 10})
    calls = {"count": 0}

    def fake_fundamentals(*args, **kwargs):
        calls["count"] += 1
        return "Revenue and earnings are stable."

    monkeypatch.setattr(interface, "get_budget", lambda _budget_id: budget)
    monkeypatch.setitem(
        interface.VENDOR_METHODS, "get_fundamentals", {"yfinance": fake_fundamentals}
    )
    interface._TOOL_CACHE._data.clear()

    with use_config(
        {
            "data_vendors": {"fundamental_data": "yfinance"},
            "tool_max_retries": 1,
            "tool_timeout_seconds": 5,
            "data_cache_backend": "memory",
            "_vendor_budget_id": "test-budget",
        }
    ):
        first = interface.route_to_vendor("get_fundamentals", "AAPL")
        second = interface.route_to_vendor("get_fundamentals", "AAPL")

    assert first == second
    assert calls["count"] == 1
    assert budget.get_summary()["data_calls"]["used"] == 1
    assert budget.get_summary()["data_calls"]["per_vendor"]["yfinance"]["cache_hits"] == 1


def test_vendor_budget_exceeded_warning_code():
    budget = VendorBudget(max_total_calls=1, per_vendor_limits={"newsdata": 1})
    budget.record_call("newsdata", "get_news")
    assert budget.can_call("newsdata") is False
    budget.record_blocked("newsdata", "get_news", "vendor_budget_exceeded")

    blocked = budget.get_summary()["data_calls"]["blocked_calls"][0]

    assert blocked["code"] == "vendor_budget_exceeded"


def test_total_data_call_exceeded_records_partial_warning():
    budget = VendorBudget(max_total_calls=1, per_vendor_limits={"yfinance": 8, "finnhub": 5})
    budget.record_call("yfinance", "get_quote")
    assert budget.can_call("finnhub") is False
    budget.record_blocked("finnhub", "get_quote", "vendor_budget_exceeded")

    summary = budget.get_summary()

    assert summary["budget_exceeded"] is True
    assert summary["data_calls"]["blocked_calls"][0]["code"] == "vendor_budget_exceeded"


def test_llm_budget_depth_limits_from_env(monkeypatch):
    import config

    with monkeypatch.context() as env:
        env.setenv("LLM_BUDGET_FAST", "2")
        env.setenv("LLM_BUDGET_BALANCED", "3")
        env.setenv("LLM_BUDGET_DEEP", "4")
        env.setenv("LLM_API_KEY", "test-llm-key")
        reloaded = config.reload_config_for_tests()

        assert (
            reloaded.build_tradingagents_config(analysis_depth="fast")["max_total_llm_calls"] == 2
        )
        assert (
            reloaded.build_tradingagents_config(analysis_depth="balanced")["max_total_llm_calls"]
            == 3
        )
        assert (
            reloaded.build_tradingagents_config(analysis_depth="deep")["max_total_llm_calls"] == 4
        )
    config.reload_config_for_tests()


def test_llm_budget_exceeded_warning_code():
    budget = LLMBudget(1)

    assert budget.consume("Market Analyst") is True
    assert budget.consume("News + Social Analyst") is False

    snapshot = budget.snapshot()
    assert snapshot["used"] == 1
    assert snapshot["max"] == 1
    assert snapshot["warnings"][0]["code"] == "llm_budget_exceeded"
