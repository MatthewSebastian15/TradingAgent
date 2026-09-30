from __future__ import annotations

from types import SimpleNamespace

import tradingagents.pipeline_balanced.orchestrator as orch
from tradingagents.agents.schemas import PortfolioDecision, PortfolioNarrative, PortfolioRating


def _ctx(depth):
    return SimpleNamespace(
        analysis_depth=depth,
        ticker="AAPL",
        trade_date="2026-09-14",
        time_horizon_text="1 month",
        deep_llm=object(),
        llm_budget=None,
        cancel_check=None,
        progress_callback=None,
        pipeline_timings={},
    )


def _stages():
    data = SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        time_horizon_months=1,
        last_close_price=100.0,
        last_close_price_as_of="2026-09-14T14:30:00+00:00",
        last_close_price_source="q",
        price_data="",
        technical_indicators="",
        price_chart={},
        price_performance={},
        technical_entry={"rsi": 55.0, "trend": "uptrend"},
        fundamental_analysis={},
        analyst_consensus={},
        catalyst_tracker={},
        derived_fundamentals=[],
        normalized_period_rows=[],
        data_limitations=[],
        data_quality=SimpleNamespace(model_dump=lambda: {}, warnings=[]),
        warnings=[],
    )
    agent = SimpleNamespace(market_md="M", news_social_md="N", fundamentals_md="F", risk_md="R")
    return SimpleNamespace(data=data, data_quality_json="{}"), agent


def _decision():
    return PortfolioDecision(
        confidence_score=0.6,
        rating=PortfolioRating.HOLD,
        final_decision="Hold",
        current_price=100.0,
    )


def test_fast_depth_uses_template_without_llm(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("fast depth must not call the LLM for narrative")

    monkeypatch.setattr(orch, "_invoke_once", boom)
    data_stage, agent_stage = _stages()
    out = orch.run_portfolio_narrative(_ctx("fast"), data_stage, agent_stage, _decision())
    assert out.narrative_source == "template"
    assert out.executive_summary
    assert out.narrative_unverified_numbers == []


def test_llm_narrative_with_invented_number_is_flagged(monkeypatch):
    narrative = PortfolioNarrative(
        executive_summary="word " * 160 + "Target 999 soon.",
        investment_thesis="reason " * 300,
        key_reasons_paragraph="because " * 80,
    )
    monkeypatch.setattr(orch, "_invoke_once", lambda *args, **kwargs: narrative)
    data_stage, agent_stage = _stages()
    out = orch.run_portfolio_narrative(_ctx("balanced"), data_stage, agent_stage, _decision())
    assert out.narrative_source == "llm"
    assert out.narrative_unverified_numbers == ["999"]
    assert any(w.startswith("NARRATIVE_UNVERIFIED_NUMBERS") for w in out.validation_warnings)
