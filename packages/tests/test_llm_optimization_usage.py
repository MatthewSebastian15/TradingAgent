import logging

from tradingagents.dataflows.config import set_config
from tradingagents.llm_optimization.usage import (
    estimate_tokens_from_text,
    normalize_usage_numbers,
)
from tradingagents.pipeline_balanced_llm import _invoke_once
from tradingagents.pipeline_balanced_types import AnalystReport


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
