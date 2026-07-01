from __future__ import annotations


def test_deep_think_agents_flows_into_pipeline_overrides(monkeypatch):
    import config_llm

    monkeypatch.setattr(config_llm, "DEEP_THINK_AGENTS", ["bull_researcher"])
    overrides = config_llm.LLMSettings().tradingagents_overrides()

    assert overrides["deep_think_agents"] == ["bull_researcher"]
