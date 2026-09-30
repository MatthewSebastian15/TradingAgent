from __future__ import annotations

from types import SimpleNamespace

import tradingagents.pipeline_balanced.orchestrator as orch


def test_every_pipeline_run_collects_market_data_fresh(monkeypatch):
    calls: list[dict] = []

    def fake_collect(context, **kwargs):
        calls.append(kwargs)
        return SimpleNamespace(data=object())

    monkeypatch.setattr(orch, "prepare_context", lambda **kwargs: SimpleNamespace())
    monkeypatch.setattr(orch, "collect_market_data", fake_collect)
    monkeypatch.setattr(orch, "run_agents", lambda context, data_stage: SimpleNamespace())
    monkeypatch.setattr(orch, "aggregate_decision", lambda *args: object())
    monkeypatch.setattr(orch, "apply_decision_consistency", lambda context, data_stage, d: d)
    monkeypatch.setattr(orch, "run_self_critique", lambda context, data_stage, decision: decision)
    monkeypatch.setattr(
        orch, "run_portfolio_narrative", lambda context, data_stage, agent_stage, d: d
    )
    monkeypatch.setattr(orch, "persist_metrics", lambda context: None)
    monkeypatch.setattr(orch, "build_response", lambda *args: {"ok": True})

    for _ in range(2):
        orch.run_balanced_pipeline("AAPL", "2026-09-14", {"job_id": "job-1"})

    assert len(calls) == 2
    assert all(call.get("cached_data") is None for call in calls)
