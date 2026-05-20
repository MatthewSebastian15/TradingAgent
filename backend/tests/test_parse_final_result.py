from __future__ import annotations


def test_parse_final_result_renders_full_decision_from_typed_object():
    from routes.analysis import _parse_final_result
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating, VolatilityLevel

    decision = PortfolioDecision(
        confidence_score=0.7,
        rating=PortfolioRating.BUY,
        executive_summary=(
            "The rating is Buy because the setup is constructive. "
            "The strongest data point is improving price action. "
            "The main risk is execution, so position size should stay controlled."
        ),
        investment_thesis=(
            "The company has a clear setup. The trend is supportive. "
            "The risk is defined. The allocation is moderate. "
            "The upside case is better than the downside case. The thesis should be reviewed after earnings."
        ),
        suggested_allocation_percent=5.0,
        entry_price=100.0,
        stop_loss=92.0,
        take_profit=116.0,
        risk_reward_ratio=2.0,
        max_drawdown_estimate="8%",
        volatility_level=VolatilityLevel.MEDIUM,
        position_sizing_reason="Moderate conviction.",
        rebalancing_action="Add gradually.",
        key_catalysts=["Earnings"],
        invalidation_conditions=["Breaks support"],
        price_target=116.0,
        time_horizon="3 months",
    )

    parsed = _parse_final_result(
        "stale markdown should be ignored",
        decision,
        PortfolioRating,
        {"budget_exhausted": True, "agents_skipped": ["Portfolio Manager"]},
    )

    assert parsed["decision"] == "Buy"
    assert parsed["full_decision"].startswith("**Rating**: Buy")
    assert "stale markdown" not in parsed["full_decision"]
    assert parsed["budget_exhausted"] is True
    assert parsed["agents_skipped"] == ["Portfolio Manager"]
