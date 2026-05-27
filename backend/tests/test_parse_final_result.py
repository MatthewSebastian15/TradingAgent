from __future__ import annotations


def test_parse_final_result_uses_typed_fields_without_rerendering_markdown():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating, VolatilityLevel

    from routes.analysis import _parse_final_result

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
        current_price=100.0,
        current_price_as_of="2026-05-18",
        current_price_source="yfinance:last_close",
        llm_decision="Buy",
        final_decision="Buy",
        decision="Buy",
        trade_plan_valid=True,
        risk_per_share=8.0,
        reward_per_share=24.0,
        risk_reward_display="1:3",
        volatility_score=44.0,
        position_size_hint="Use standard risk management and avoid oversized position.",
        max_drawdown_min_pct=8.0,
        max_drawdown_max_pct=12.0,
        data_quality={"price_data": "ok", "trade_levels": "ok", "llm_output": "ok", "volatility_data": "ok"},
        validation_warnings=[],
    )

    parsed = _parse_final_result(
        "existing markdown should be passed through",
        decision,
        PortfolioRating,
        {
            "budget_exhausted": True,
            "agents_skipped": ["Portfolio Manager"],
            "data_fetched_at": "2026-05-20T10:11:12.123456",
            "last_close_price": 100.0,
            "last_close_price_as_of": "2026-05-18",
            "trade_date": "2026-05-18",
        },
    )

    assert parsed["decision"] == "Buy"
    assert parsed["full_decision"] == "existing markdown should be passed through"
    assert parsed["data_fetched_at"] == "2026-05-20T10:11:12.123456"
    assert parsed["budget_exhausted"] is True
    assert parsed["agents_skipped"] == ["Portfolio Manager"]
    assert parsed["current_price"] == 100.0
    assert parsed["current_price_as_of"] == "2026-05-18"
    assert parsed["current_price_source"] == "yfinance:last_close"
    assert parsed["llm_decision"] == "Buy"
    assert parsed["final_decision"] == "Buy"
    assert parsed["trade_plan_valid"] is True
    assert parsed["risk_reward_display"] == "1:3"
    assert parsed["risk_per_share"] == 8.0
    assert parsed["reward_per_share"] == 24.0
    assert parsed["volatility_score"] == 44.0
    assert parsed["position_size_hint"] == "Use standard risk management and avoid oversized position."
    assert parsed["data_quality"]["price_data"] == "ok"
    assert parsed["validation_warnings"] == []


def test_parse_final_result_does_not_render_full_decision_from_portfolio_object():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    from routes.analysis import _parse_final_result

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


def test_parse_final_result_treats_invalid_pd_obj_as_missing():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    parsed = _parse_final_result(
        "raw final decision",
        {"rating": "NOT_A_VALID_RATING", "confidence_score": "not-a-number"},
        PortfolioRating,
        {},
    )

    assert parsed["decision"] == "Hold"
    assert parsed["final_decision"] == "Hold"
    assert parsed["full_decision"] == "raw final decision"
    assert parsed["trade_plan_valid"] is False
    assert parsed["key_catalysts"] == []
    assert parsed["invalidation_conditions"] == []


def test_summary_shape_keeps_investment_thesis():
    from routes.serializers import shape_result

    shaped = shape_result(
        {
            "decision": "Buy",
            "executive_summary": "Summary",
            "investment_thesis": "Thesis should remain visible in summary mode.",
            "full_decision": "Verbose markdown should be trimmed.",
            "raw_agent_state": {"internal": True},
        },
        "summary",
    )

    assert shaped["investment_thesis"] == "Thesis should remain visible in summary mode."
    assert "full_decision" not in shaped
    assert "raw_agent_state" not in shaped


def test_parse_final_result_fallback_contract_is_non_actionable():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    parsed = _parse_final_result("", None, PortfolioRating, {"trade_date": "2026-05-18"})

    assert parsed["current_price"] is None
    assert parsed["current_price_as_of"] == "2026-05-18"
    assert parsed["trade_plan_valid"] is False
    assert parsed["decision"] == "Hold"
    assert parsed["final_decision"] == "Hold"
    assert parsed["rebalancing_action"] == "Wait and monitor"
    assert parsed["position_size_hint"] == "No new position suggested."
    assert parsed["decision_adjusted"] is False
    assert parsed["validation_warnings"] == []
    assert parsed["data_quality"]["price_data"] == "missing"
    assert parsed["data_quality"]["trade_levels"] == "invalid"
    assert parsed["data_quality"]["llm_output"] == "fallback"
    assert parsed["data_quality"]["volatility_data"] == "missing"


def test_parse_final_result_completes_legacy_data_quality_contract():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    from routes.analysis import _parse_final_result

    decision = PortfolioDecision(
        confidence_score=0.6,
        rating=PortfolioRating.HOLD,
        executive_summary=(
            "The rating is Hold because the setup is balanced. "
            "The strongest data point is stable price action. "
            "The main risk is weak confirmation."
        ),
        investment_thesis=(
            "The company is stable. The setup needs patience. "
            "The risk is not severe. The reward is not compelling. "
            "No new trade is needed. The thesis can be reviewed later."
        ),
        data_quality={"price_data": "ok", "fundamentals": "partial", "news": "missing"},
    )

    parsed = _parse_final_result(
        "",
        decision,
        PortfolioRating,
        {"last_close_price": 100.0, "last_close_price_as_of": "2026-05-18"},
    )

    assert parsed["data_quality"]["price_data"] == "ok"
    assert parsed["data_quality"]["fundamentals"] == "partial"
    assert parsed["data_quality"]["news"] == "missing"
    assert parsed["data_quality"]["trade_levels"] == "invalid"
    assert parsed["data_quality"]["llm_output"] == "ok"
    assert parsed["data_quality"]["volatility_data"] == "missing"
