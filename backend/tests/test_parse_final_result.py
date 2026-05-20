from __future__ import annotations


def test_parse_final_result_uses_typed_fields_without_rerendering_markdown():
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
        "existing markdown should be passed through",
        decision,
        PortfolioRating,
        {
            "budget_exhausted": True,
            "agents_skipped": ["Portfolio Manager"],
            "data_fetched_at": "2026-05-20T10:11:12.123456",
        },
    )

    assert parsed["decision"] == "Buy"
    assert parsed["full_decision"] == "existing markdown should be passed through"
    assert parsed["data_fetched_at"] == "2026-05-20T10:11:12.123456"
    assert parsed["budget_exhausted"] is True
    assert parsed["agents_skipped"] == ["Portfolio Manager"]


def test_parse_final_result_does_not_render_full_decision_from_portfolio_object():
    from routes.analysis import _parse_final_result
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    decision = PortfolioDecision(
        confidence_score=0.4,
        rating=PortfolioRating.HOLD,
        executive_summary=(
            "The rating is Hold because evidence is mixed. "
            "The strongest data point is stable price action. "
            "The main risk is limited upside."
        ),
        investment_thesis=(
            "The company is stable. The setup is not urgent. "
            "The risk is manageable. The allocation should stay low. "
            "The upside and downside are balanced. The thesis should be reviewed later."
        ),
    )

    parsed = _parse_final_result("", decision, PortfolioRating, {})

    assert parsed["decision"] == "Hold"
    assert parsed["full_decision"] == ""
