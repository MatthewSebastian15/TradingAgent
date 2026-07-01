from types import SimpleNamespace

import tradingagents.pipeline_balanced_orchestrator as orch
from tradingagents.agents.schemas import (
    PortfolioDecision,
    PortfolioRating,
    SelfCritiqueResult,
)


def _decision(rating=PortfolioRating.BUY):
    return PortfolioDecision(
        confidence_score=0.9,
        rating=rating,
        executive_summary="word " * 200,
        investment_thesis="reason " * 300,
        suggested_allocation_percent=10.0,
    )


def _ctx(depth="deep"):
    return SimpleNamespace(
        analysis_depth=depth,
        ticker="AAPL",
        trade_date="2026-06-30",
        time_horizon_text="1 month",
        deep_llm=object(),
        llm_budget=None,
        cancel_check=None,
        has_existing_position=False,
        progress_callback=None,
        pipeline_timings={},
    )


def _data_stage():
    data = SimpleNamespace(data_quality=SimpleNamespace(warnings=[]), warnings=[])
    return SimpleNamespace(data=data, data_quality_json="{}")


def test_self_critique_downgrades_violating_buy(monkeypatch):
    monkeypatch.setattr(
        orch,
        "_invoke_once",
        lambda *a, **k: SelfCritiqueResult(
            should_downgrade=True,
            violations=["Buy contradicts stale price data marked unavailable."],
        ),
    )
    decision = _decision()
    out = orch.run_self_critique(_ctx(), _data_stage(), decision)

    assert out.rating == PortfolioRating.HOLD
    assert out.decision_adjusted is True
    assert out.suggested_allocation_percent == 0.0
    assert any("Self-critique:" in w for w in out.validation_warnings)


def test_self_critique_keeps_sound_decision(monkeypatch):
    monkeypatch.setattr(
        orch,
        "_invoke_once",
        lambda *a, **k: SelfCritiqueResult(should_downgrade=False, violations=[]),
    )
    decision = _decision()
    out = orch.run_self_critique(_ctx(), _data_stage(), decision)

    assert out.rating == PortfolioRating.BUY
    assert out.decision_adjusted is not True


def test_self_critique_skipped_when_not_deep(monkeypatch):
    def _boom(*a, **k):
        raise AssertionError("self-critique must not call the LLM outside deep depth")

    monkeypatch.setattr(orch, "_invoke_once", _boom)
    decision = _decision()
    out = orch.run_self_critique(_ctx(depth="balanced"), _data_stage(), decision)

    assert out.rating == PortfolioRating.BUY
