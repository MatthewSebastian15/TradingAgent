from __future__ import annotations



def _valid_executive_summary() -> str:
    return (
        "The final rating is Hold because the available evidence is balanced and the setup does not justify forcing a new position before confirmation improves. "
        "The strongest support comes from stable price behavior, controlled downside assumptions, and a risk plan that keeps capital protected while the next catalyst develops. "
        "The biggest risk is incomplete data or weak confirmation, because either problem could turn a neutral setup into a poor trade. "
        "The recommended action is to keep allocation modest, avoid adding size, wait for a cleaner entry, and only use a stop-loss after price data confirms the setup. "
        "The expected horizon is short to medium term, and the thesis should be confirmed by stronger trend evidence or invalidated by a break below support. "
        "It also names the rating, support, risk, action plan, sizing posture, stop context, time horizon, and invalidation logic so the object behaves like a real portfolio manager response. "
        "The wording is deliberately reusable so schema validation remains stable across parse, memory, and trade-level tests without changing assertions."
    )


def _valid_investment_thesis() -> str:
    return (
        "The investment thesis is intentionally cautious because the available evidence supports patience more than immediate action. "
        "The company remains relevant in its market, but the current setup needs stronger confirmation before it deserves a larger allocation. "
        "The most useful signals are stable price behavior, controlled risk assumptions, and a trade plan that avoids oversized exposure while waiting for the next catalyst. "
        "Those signals are helpful, but they are not strong enough to justify a high-conviction Buy without cleaner momentum, better data quality, and a more attractive entry point. "
        "The bear case is that weak confirmation, stale inputs, or sudden volatility could quickly damage the risk/reward profile. "
        "That bear case matters because a trade can be directionally reasonable and still be poor if the entry is late or the stop-loss is not respected. "
        "The balanced conclusion is to wait, keep allocation limited, and require stronger evidence before increasing exposure. "
        "The action plan is to avoid chasing price, use a smaller position only if the setup improves, define the stop-loss before entry, and take profit only when the validated risk/reward target is reached. "
        "If the next catalyst confirms stronger demand and price stability, the thesis can be upgraded; if support breaks, the idea should be rejected. "
        "This helper also keeps tests readable by using one reusable narrative instead of scattering short invalid placeholders across unrelated assertions. "
        "The exact company is not important here; what matters is that schema validation, parsing, serialization, and trade-level normalization all receive text that matches the production contract. "
        "The longer body also proves rendered reports can carry realistic paragraphs without collapsing around short placeholder text."
    )


def test_parse_final_result_uses_typed_fields_without_rerendering_markdown():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating, VolatilityLevel

    from routes.analysis import _parse_final_result

    decision = PortfolioDecision(
        confidence_score=0.7,
        rating=PortfolioRating.BUY,
        executive_summary=_valid_executive_summary(),
        investment_thesis=_valid_investment_thesis(),
        suggested_allocation_percent=5.0,
        entry_price=100.0,
        stop_loss=92.0,
        take_profit=124.0,
        risk_reward_ratio=3.0,
        max_drawdown_estimate="8%",
        volatility_level=VolatilityLevel.MEDIUM,
        position_sizing_reason="Moderate conviction.",
        rebalancing_action="Add gradually.",
        key_catalysts=["Earnings"],
        invalidation_conditions=["Breaks support"],
        price_target=124.0,
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
    assert parsed["risk_reward_ratio"] == 3.0
    assert parsed["risk_reward_display"] == "1:3"
    assert parsed["risk_per_share"] == 8.0
    assert parsed["reward_per_share"] == 24.0
    assert parsed["volatility_score"] == 44.0
    assert parsed["position_size_hint"] == "Use standard risk management and avoid oversized position."
    assert parsed["data_quality"]["price_data"] == "ok"
    assert parsed["validation_warnings"] == []


def test_parse_final_result_forces_valid_trade_rr_to_one_to_three():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    from routes.analysis import _parse_final_result

    decision = PortfolioDecision(
        confidence_score=0.7,
        rating=PortfolioRating.BUY,
        executive_summary=_valid_executive_summary(),
        investment_thesis=_valid_investment_thesis(),
        entry_price=100.0,
        stop_loss=95.0,
        take_profit=125.0,
        risk_reward_ratio=5.0,
        risk_reward_display="1:" + "5",
        risk_per_share=5.0,
        reward_per_share=25.0,
        final_decision="Buy",
        decision="Buy",
        trade_plan_valid=True,
    )

    parsed = _parse_final_result("", decision, PortfolioRating, {"last_close_price": 100.0})

    assert parsed["risk_reward_ratio"] == 3.0
    assert parsed["risk_reward_display"] == "1:3"


def test_parse_final_result_does_not_render_full_decision_from_portfolio_object():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    from routes.analysis import _parse_final_result

    decision = PortfolioDecision(
        confidence_score=0.4,
        rating=PortfolioRating.HOLD,
        executive_summary=_valid_executive_summary(),
        investment_thesis=_valid_investment_thesis(),
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


def test_summary_shape_keeps_financial_highlights():
    from routes.serializers import shape_result

    financial_highlights = {
        "periods": [{"key": "FY25", "label": "FY25"}],
        "rows": [{"key": "revenue", "values": {"FY25": {"display": "100.0"}}}],
    }

    shaped = shape_result({"decision": "Hold", "financial_highlights": financial_highlights}, "summary")

    assert shaped["financial_highlights"] == financial_highlights


def test_parse_final_result_preserves_financial_highlights():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    financial_highlights = {"periods": [{"key": "FY25"}], "rows": []}
    parsed = _parse_final_result("", None, PortfolioRating, {"financial_highlights": financial_highlights})

    assert parsed["financial_highlights"] == financial_highlights


def test_summary_shape_keeps_company_profile():
    from routes.serializers import shape_result

    company_profile = {"available": True, "ticker": "BBCA.JK", "name": "PT Bank Central Asia Tbk"}

    shaped = shape_result({"decision": "Hold", "company_profile": company_profile}, "summary")

    assert shaped["company_profile"] == company_profile


def test_parse_final_result_preserves_company_profile():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    company_profile = {"available": False, "ticker": "AAPL", "warning": "offline"}
    parsed = _parse_final_result("", None, PortfolioRating, {"company_profile": company_profile})

    assert parsed["company_profile"] == company_profile


def test_parse_final_result_fallback_contract_is_non_actionable():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    parsed = _parse_final_result("", None, PortfolioRating, {"trade_date": "2026-05-18"})

    assert parsed["current_price"] is None
    assert parsed["current_price_as_of"] == "2026-05-18"
    assert parsed["trade_plan_valid"] is False
    assert parsed["decision"] == "Hold"
    assert parsed["final_decision"] == "Hold"
    assert parsed["rebalancing_action"] == "Avoid new entry"
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
        executive_summary=_valid_executive_summary(),
        investment_thesis=_valid_investment_thesis(),
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
