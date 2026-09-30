from __future__ import annotations

from types import SimpleNamespace

import tradingagents.pipeline_balanced.orchestrator as orch
from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
from tradingagents.decision_consistency import (
    contradiction_reason,
    earnings_block_reason,
    trade_plan_violations,
)


def _decision(**overrides) -> PortfolioDecision:
    data = {
        "confidence_score": 0.8,
        "rating": PortfolioRating.BUY,
        "executive_summary": "word " * 200,
        "investment_thesis": "reason " * 300,
    }
    data.update(overrides)
    return PortfolioDecision(**data)


def test_earnings_block_only_for_new_positions():
    assert earnings_block_reason("BUY", earnings_within_days=1, has_existing_position=False)
    assert earnings_block_reason("BUY", earnings_within_days=1, has_existing_position=True) is None
    assert earnings_block_reason("BUY", earnings_within_days=6, has_existing_position=False) is None
    assert (
        earnings_block_reason("WAIT", earnings_within_days=0, has_existing_position=False) is None
    )


def test_contradiction_requires_all_three_signals():
    args = dict(
        technical_entry={"trend": "downtrend"},
        fundamental_signal="bearish",
        analyst_consensus={"consensus_label": "negative"},
    )
    assert "contradicts" in contradiction_reason("BUY", **args)
    assert (
        contradiction_reason("BUY", **{**args, "analyst_consensus": {"consensus_label": "N/A"}})
        is None
    )


def test_trade_plan_violations_catch_bad_order_and_orphan_allocation():
    bad = _decision(
        final_decision="Buy",
        trade_plan_valid=True,
        entry_price=100.0,
        stop_loss=101.0,
        take_profit=110.0,
    )
    assert trade_plan_violations(bad) == ["CONSISTENCY_LONG_LEVEL_ORDER"]
    orphan = _decision(
        final_decision="Hold", trade_plan_valid=False, suggested_allocation_percent=5.0
    )
    assert trade_plan_violations(orphan) == ["CONSISTENCY_ALLOCATION_WITHOUT_PLAN"]


def test_stage_downgrades_contradicted_buy():
    decision = _decision(
        final_decision="Buy",
        decision="Buy",
        trade_plan_valid=True,
        entry_price=100.0,
        stop_loss=95.0,
        take_profit=115.0,
    )
    data = SimpleNamespace(
        technical_entry={"trend": "downtrend"},
        fundamental_analysis={"fundamental_signal": "bearish"},
        analyst_consensus={"consensus_label": "negative"},
        data_quality=SimpleNamespace(warnings=[]),
        warnings=[],
    )
    context = SimpleNamespace(has_existing_position=False)

    out = orch.apply_decision_consistency(context, SimpleNamespace(data=data), decision)

    assert out.final_decision == "Hold"
    assert out.decision_adjusted is True
    assert any("contradicts" in w for w in out.validation_warnings)
