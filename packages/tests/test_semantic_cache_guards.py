from tradingagents.dataflows.providers.config import get_config, set_config
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


def test_semantic_cache_requires_guard_and_similarity_threshold(tmp_path):
    from tradingagents.dataflows.providers.config import initialize_config

    try:
        set_config(
            {
                "llm_semantic_cache_enabled": True,
                "llm_semantic_cache_db_path": str(tmp_path / "semantic.sqlite3"),
                "llm_semantic_cache_ttl_seconds": 3600,
                "llm_semantic_cache_max_entries": 10,
                "llm_semantic_cache_similarity_threshold": 0.99,
            }
        )
        guard = semantic_guard_for_agent(
            ticker="BBCA.JK",
            trade_date="2026-06-02",
            time_horizon_months=1,
            agent_name="Market Analyst",
            schema_name="AnalystReport",
            provider="google",
            model="gemini-2.5-flash",
            data_hash="data-v1",
        )
        cache = get_semantic_cache(get_config())
        assert cache is not None

        cache.set(
            namespace="agent_report_eval",
            guard=guard,
            embedding=[1.0, 0.0],
            value={"summary": "cached report"},
        )

        hit = cache.find(namespace="agent_report_eval", guard=guard, embedding=[1.0, 0.0])
        assert hit is not None
        assert hit["value"] == {"summary": "cached report"}

        low_similarity = cache.find(
            namespace="agent_report_eval", guard=guard, embedding=[0.0, 1.0]
        )
        assert low_similarity is None

        changed_guard = {**guard, "data_hash": "data-v2"}
        changed_data = cache.find(
            namespace="agent_report_eval", guard=changed_guard, embedding=[1.0, 0.0]
        )
        assert changed_data is None
    finally:
        initialize_config()
