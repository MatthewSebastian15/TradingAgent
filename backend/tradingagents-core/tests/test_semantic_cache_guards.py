from tradingagents.dataflows.config import get_config, set_config
from tradingagents.llm_cache.semantic_cache import (
    cosine_similarity,
    get_semantic_cache,
    semantic_guard_for_agent,
)


def test_semantic_guard_differs_by_ticker():
    guard_a = semantic_guard_for_agent(
        ticker="BBCA.JK",
        trade_date="2026-06-02",
        time_horizon_months=1,
        agent_name="Market Analyst",
        schema_name="AnalystReport",
        provider="google",
        model="gemini-2.5-flash",
        data_hash="same",
    )
    guard_b = semantic_guard_for_agent(
        ticker="BBRI.JK",
        trade_date="2026-06-02",
        time_horizon_months=1,
        agent_name="Market Analyst",
        schema_name="AnalystReport",
        provider="google",
        model="gemini-2.5-flash",
        data_hash="same",
    )

    assert guard_a != guard_b


def test_semantic_cache_disabled_by_default(tmp_path):
    set_config(
        {
            "llm_semantic_cache_enabled": False,
            "llm_semantic_cache_db_path": str(tmp_path / "semantic.sqlite3"),
        }
    )

    assert get_config()["llm_semantic_cache_enabled"] is False
    assert get_semantic_cache(get_config()) is None


def test_cosine_similarity_requires_matching_vectors():
    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert cosine_similarity([1.0], [1.0, 0.0]) == 0.0

