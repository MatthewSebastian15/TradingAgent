from __future__ import annotations

from types import SimpleNamespace

from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
from tradingagents.pipeline_balanced.narrative_facts import (
    build_template_narrative,
    build_verified_facts,
)
from tradingagents.pipeline_balanced.numeric_claims import unverified_numbers


def _data():
    return SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        time_horizon_months=1,
        last_close_price=100.0,
        last_close_price_as_of="2026-09-14T14:30:00+00:00",
        last_close_price_source="yfinance:live_quote",
        price_data="",
        technical_indicators="",
        price_chart={},
        price_performance={},
        technical_entry={
            "rsi": 55.2,
            "trend": "uptrend",
            "support": 95.0,
            "resistance": 110.0,
            "atr": 2.0,
        },
        fundamental_analysis={"fundamental_score": 68, "fundamental_signal": "neutral"},
        analyst_consensus={
            "available": True,
            "strong_buy": 5,
            "buy": 10,
            "hold": 8,
            "sell": 1,
            "strong_sell": 0,
        },
        catalyst_tracker={"upcoming_events": [{"type": "earnings", "date": "2026-10-29"}]},
        derived_fundamentals=[{"derived_metrics": {"net_profit_margin": {"value": 24.1}}}],
        normalized_period_rows=[],
        data_quality=SimpleNamespace(model_dump=lambda: {}),
        data_sources={},
        data_limitations=[],
    )


def test_template_narrative_uses_only_verified_numbers():
    decision = PortfolioDecision(
        confidence_score=0.72,
        rating=PortfolioRating.BUY,
        final_decision="Buy",
        current_price=100.0,
        entry_price=100.0,
        stop_loss=94.5,
        take_profit=116.5,
        trade_plan_valid=True,
        risk_reward_display="1:3",
        suggested_allocation_percent=2.5,
        volatility_level="Medium",
        max_drawdown_min_pct=5.5,
        max_drawdown_max_pct=18.2,
        key_reasons=["Uptrend with support nearby."],
    )
    facts = build_verified_facts(decision, _data(), "1 month")
    narrative = build_template_narrative(decision, facts)

    assert facts["confidence_percent"] == 72
    assert facts["net_profit_margin"] == 24.1
    assert facts["analyst_buy"] == 15
    joined = " ".join(
        [narrative.executive_summary, narrative.investment_thesis, narrative.key_reasons_paragraph]
    )
    assert "94.5" in joined
    assert unverified_numbers(joined, facts) == []
