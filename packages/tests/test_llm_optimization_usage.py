import logging

from tradingagents.dataflows.providers.config import set_config
from tradingagents.dataflows.providers.errors import ErrorCode
from tradingagents.llm_optimization.usage import (
    LLMUsageRecord,
    estimate_tokens_from_text,
    get_usage_summary,
    normalize_usage_numbers,
    record_usage,
    reset_usage,
)
from tradingagents.pipeline_balanced_llm import _fallback_report, _invoke_once
from tradingagents.pipeline_balanced_types import AnalystReport, LLMBudget


class FlakyLLM:
    provider = "google"
    model_name = "gemini-test"

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def with_structured_output(self, schema):
        return self

    def invoke(self, prompt):
        response = self.responses[self.calls]
        self.calls += 1
        return response


def _valid_report():
    return AnalystReport(
        title="Market Report",
        summary="The setup is supported by the supplied data.",
        key_points=["Trend is positive."],
        risks=["News coverage may change."],
        confidence=0.7,
    )


def test_invoke_once_repairs_then_succeeds():
    llm = FlakyLLM(["not valid json", _valid_report()])
    set_config({"llm_exact_cache_enabled": False, "llm_max_retries": 1})
    budget = LLMBudget(limit=5)
    fallback = _fallback_report("Fallback", "Fallback summary text for the report.")
    reset_usage()

    result = _invoke_once(llm, AnalystReport, "Prompt", fallback, "Market Analyst", budget=budget)

    assert result.title == "Market Report"
    assert llm.calls == 2  # first attempt failed, repair attempt succeeded
    assert budget.used == 2  # repair counted against budget
    row = get_usage_summary()["agents"]["Market Analyst"]
    assert row["parse_ok"] == 1
    assert row["fallbacks"] == 0


def test_invoke_once_falls_back_after_repair_fails():
    llm = FlakyLLM(["bad one", "bad two"])
    set_config({"llm_exact_cache_enabled": False, "llm_max_retries": 1})
    budget = LLMBudget(limit=5)
    fallback = _fallback_report("Fallback", "Fallback summary text for the report.")
    reset_usage()

    result = _invoke_once(llm, AnalystReport, "Prompt", fallback, "Market Analyst", budget=budget)

    assert result is fallback
    assert result.confidence == 0.0  # honest fallback: zero confidence
    assert budget.used == 2
    assert any(w["code"] == ErrorCode.LLM_SCHEMA_INVALID for w in budget.snapshot()["warnings"])
    assert get_usage_summary()["agents"]["Market Analyst"]["fallbacks"] == 1


def test_estimate_tokens_from_text_is_conservative():
    assert estimate_tokens_from_text("") == 1
    assert estimate_tokens_from_text("abcd" * 10) == 10


def test_normalize_usage_numbers_extracts_provider_cache_metadata():
    output_tokens, cached_input_tokens = normalize_usage_numbers(
        {
            "usage_metadata": {
                "output_tokens": 42,
                "input_token_details": {"cached_tokens": 10},
            }
        }
    )

    assert output_tokens == 42
    assert cached_input_tokens == 10


def _record(agent, **flags):
    rec = LLMUsageRecord(
        agent_name=agent,
        provider="google",
        model="gemini-test",
        schema_name="AnalystReport",
        prompt_chars=100,
        estimated_input_tokens=25,
        latency_ms=flags.pop("latency_ms", 100.0),
    )
    for key, value in flags.items():
        setattr(rec, key, value)
    record_usage(rec)


def test_reset_usage_and_per_agent_flags():
    reset_usage()
    _record("Market Analyst", parse_success=True, latency_ms=100.0)
    _record("Market Analyst", fallback_used=True, latency_ms=300.0)
    _record("News Analyst", cache_hit=True, parse_success=True)

    summary = get_usage_summary()
    market = summary["agents"]["Market Analyst"]
    assert market["calls"] == 2
    assert market["fallbacks"] == 1
    assert market["parse_ok"] == 1
    assert market["total_latency_ms"] == 400.0
    assert summary["agents"]["News Analyst"]["cache_hits"] == 1
    assert summary["totals"]["calls"] == 3

    reset_usage()
    assert get_usage_summary()["totals"]["calls"] == 0


def test_telemetry_persists_across_restart(tmp_path, monkeypatch):
    from tradingagents.llm_optimization import usage

    monkeypatch.setattr(usage, "_TELEMETRY_DB_PATH", tmp_path / "telemetry.sqlite3")
    usage.reset_telemetry()
    usage.ingest_analysis_telemetry(
        {"agents": {"Market Analyst": {"calls": 3, "estimated_tokens": 10}}},
        ticker="AAPL",
        news={"empty_reason": "no_company_news"},
    )

    # Simulate a restart: wipe memory, force re-hydration from the sqlite snapshot.
    usage._telemetry_agents.clear()
    usage._telemetry_news_blanks.clear()
    monkeypatch.setattr(usage, "_telemetry_loaded", False)

    summary = usage.get_telemetry_summary()
    assert summary["agents"]["Market Analyst"]["calls"] == 3
    assert summary["news_blank_count"] == 1

    usage.reset_telemetry()
    assert usage.get_telemetry_summary()["totals"]["calls"] == 0


def test_invoke_once_logs_usage_on_success(tmp_path, caplog):
    class DummyLLM:
        provider = "google"
        model_name = "gemini-test"

        def with_structured_output(self, schema):
            return self

        def invoke(self, prompt):
            return AnalystReport(
                title="Market Report",
                summary="The setup is supported by the supplied data.",
                key_points=["Trend is positive."],
                risks=["News coverage may change."],
                confidence=0.7,
            )

    set_config(
        {
            "llm_exact_cache_enabled": False,
            "llm_exact_cache_db_path": str(tmp_path / "llm.sqlite3"),
        }
    )
    fallback = AnalystReport(
        title="Fallback", summary="Fallback", key_points=[], risks=[], confidence=0.1
    )

    with caplog.at_level(logging.INFO, logger="tradingagents.llm_optimization.usage"):
        result = _invoke_once(DummyLLM(), AnalystReport, "Prompt", fallback, "Market Analyst")

    assert result.title == "Market Report"
    assert "LLM usage | agent=Market Analyst" in caplog.text
    assert "parse_success=True" in caplog.text
    assert "fallback=False" in caplog.text
