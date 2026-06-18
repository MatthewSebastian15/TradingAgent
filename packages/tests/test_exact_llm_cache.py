from tradingagents.dataflows.config import set_config
from tradingagents.llm_cache.exact_cache import ExactLLMCache
from tradingagents.llm_cache.keys import build_exact_cache_key
from tradingagents.pipeline_balanced_llm import _invoke_once
from tradingagents.pipeline_balanced_types import AnalystReport, LLMBudget


def test_exact_cache_key_changes_when_prompt_changes():
    key_a = build_exact_cache_key(
        provider="google",
        model="gemini-2.5-flash",
        agent_name="Market Analyst",
        schema_name="AnalystReport",
        prompt="same prompt",
    )
    key_b = build_exact_cache_key(
        provider="google",
        model="gemini-2.5-flash",
        agent_name="Market Analyst",
        schema_name="AnalystReport",
        prompt="same prompt changed",
    )

    assert key_a != key_b


def test_exact_cache_key_changes_when_identity_changes():
    base = {
        "provider": "google",
        "model": "gemini-2.5-flash",
        "agent_name": "Market Analyst",
        "schema_name": "AnalystReport",
        "prompt": "same prompt",
    }

    assert build_exact_cache_key(**base) != build_exact_cache_key(**{**base, "provider": "openai"})
    assert build_exact_cache_key(**base) != build_exact_cache_key(
        **{**base, "model": "gemini-2.5-pro"}
    )
    assert build_exact_cache_key(**base) != build_exact_cache_key(
        **{**base, "schema_name": "RiskCommitteeReport"}
    )


def test_exact_cache_roundtrip(tmp_path):
    cache = ExactLLMCache(str(tmp_path / "cache.sqlite3"), ttl_seconds=60, max_entries=10)
    key = build_exact_cache_key(
        provider="google",
        model="gemini-2.5-flash",
        agent_name="Market Analyst",
        schema_name="AnalystReport",
        prompt="hello",
    )
    value = AnalystReport(
        title="Market Report",
        summary="Summary",
        key_points=["Point"],
        risks=["Risk"],
        confidence=0.5,
    )

    cache.set(key, value)
    cached = cache.get(key, AnalystReport)

    assert cached is not None
    assert cached.title == "Market Report"


def test_exact_cache_hit_does_not_consume_budget(tmp_path):
    class CountingLLM:
        provider = "google"
        model_name = "gemini-test"

        def __init__(self):
            self.calls = 0

        def with_structured_output(self, schema):
            return self

        def invoke(self, prompt):
            self.calls += 1
            return AnalystReport(
                title="Market Report",
                summary="Summary",
                key_points=["Point"],
                risks=["Risk"],
                confidence=0.5,
            )

    set_config(
        {
            "llm_exact_cache_enabled": True,
            "llm_exact_cache_db_path": str(tmp_path / "llm_exact.sqlite3"),
            "llm_exact_cache_ttl_seconds": 60,
            "llm_exact_cache_max_entries": 10,
        }
    )
    llm = CountingLLM()
    budget = LLMBudget(limit=1)
    fallback = AnalystReport(
        title="Fallback", summary="Fallback", key_points=[], risks=[], confidence=0.1
    )

    first = _invoke_once(llm, AnalystReport, "same prompt", fallback, "Market Analyst", budget)
    second = _invoke_once(llm, AnalystReport, "same prompt", fallback, "Market Analyst", budget)

    assert first.title == "Market Report"
    assert second.title == "Market Report"
    assert llm.calls == 1
    assert budget.snapshot()["used"] == 1
