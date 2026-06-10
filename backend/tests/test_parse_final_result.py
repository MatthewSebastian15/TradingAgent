from __future__ import annotations


def _count_words(text: str) -> int:
    return len([word for word in text.split() if word])


def _valid_executive_summary() -> str:
    return (
        'The final rating is Hold because the available evidence is balanced and the setup does not justify forcing a new position before confirmation improves. The strongest support comes from stable price behavior, controlled downside assumptions, and a risk plan that keeps capital protected while the next catalyst develops. The biggest risk is incomplete data or weak confirmation, because either problem could turn a neutral setup into a poor trade. The recommended action is to keep allocation modest, avoid adding size, wait for a cleaner entry, and only use a stop loss after price data confirms the setup. The expected horizon is short to medium term, and the thesis should be confirmed by stronger trend evidence or invalidated by a break below support. It also names the rating, support, risk, action plan, sizing posture, stop context, time horizon, and invalidation logic so the object behaves like a real portfolio manager response. The wording is deliberately reusable so schema validation remains stable across parse, memory, and trade level tests without changing assertions. The summary also includes enough realistic context to satisfy production length checks, because short placeholders are dangerous when the schema is deliberately strict. It explains that allocation should remain conservative, that price confirmation matters more than narrative confidence, and that the user should avoid pretending a watchlist idea is already a validated trade. This extra detail keeps test fixtures aligned with the same narrative contract used by real analysis responses. It also confirms that action wording, risk posture, position context, and validation behavior can be tested together without inventing a live recommendation.'
    )


def _valid_investment_thesis() -> str:
    return (
        'The investment thesis is intentionally cautious because the available evidence supports patience more than immediate action. The company remains relevant in its market, but the current setup needs stronger confirmation before it deserves a larger allocation. The most useful signals are stable price behavior, controlled risk assumptions, and a trade plan that avoids oversized exposure while waiting for the next catalyst. Those signals are helpful, but they are not strong enough to justify a high conviction Buy without cleaner momentum, better data quality, and a more attractive entry point. The bear case is that weak confirmation, stale inputs, or sudden volatility could quickly damage the risk reward profile. That bear case matters because a trade can be directionally reasonable and still be poor if the entry is late or the stop loss is not respected. The balanced conclusion is to wait, keep allocation limited, and require stronger evidence before increasing exposure. The action plan is to avoid chasing price, use a smaller position only if the setup improves, define the stop loss before entry, and take profit only when the validated risk reward target is reached. If the next catalyst confirms stronger demand and price stability, the thesis can be upgraded; if support breaks, the idea should be rejected. This helper also keeps tests readable by using one reusable narrative instead of scattering short invalid placeholders across unrelated assertions. The exact company is not important here; what matters is that schema validation, parsing, serialization, and trade level normalization all receive text that matches the production contract. The mock company is assumed to have an understandable business model, reasonable liquidity, and enough public information for a normal research workflow, but conviction remains limited because the evidence is deliberately neutral. Price action is described as stable rather than decisive, which means support and resistance levels should guide action more than broad company quality. Fundamentals are treated as acceptable but not powerful enough to overwhelm timing risk, so revenue, margin, balance sheet, and cash flow details should be monitored before any upgrade. Technical confirmation is also required because a good business can still be a poor short term trade when volatility rises or entry quality deteriorates. The preferred outcome is a patient watchlist stance that becomes actionable only after price, data quality, and risk reward all improve together. The downside case would gain force if support fails, if financial updates disappoint, or if market liquidity weakens. The upside case would gain force if catalysts arrive with stronger volume, cleaner earnings quality, and a valid entry setup. Until then, the correct conclusion is disciplined patience, not heroic improvisation dressed up as portfolio management.'
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
        rebalancing_action="Open new position",
        has_existing_position=False,
        position_quantity=None,
        average_entry_price=None,
        position_action=None,
        new_entry_action="Allowed with validated entry",
        key_catalysts=["Earnings"],
        key_reasons=["Validated earnings growth"],
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
        position_size_hint="Use standard starter size and avoid oversized entry.",
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
    assert parsed["position_size_hint"] == "Use standard starter size and avoid oversized entry."
    assert parsed["analysis_overview"]["recommendation"] == "Buy"
    assert parsed["analysis_overview"]["confidence"] == "Medium"
    assert parsed["analysis_overview"]["key_reasons"] == ["Validated earnings growth"]
    assert parsed["key_reasons_paragraph"] == parsed["analysis_overview"]["key_reasons_paragraph"]
    assert parsed["analysis_overview"]["action_plan"]["risk_reward_ratio"] == 3.0
    assert parsed["data_quality"]["price_data"] == "ok"
    assert parsed["validation_warnings"] == []


def test_parse_final_result_builds_key_reasons_paragraph():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    from routes.analysis import _parse_final_result

    decision = PortfolioDecision(
        confidence_score=0.68,
        rating=PortfolioRating.HOLD,
        executive_summary=_valid_executive_summary(),
        investment_thesis=_valid_investment_thesis(),
        key_reasons=[
            "Improving earnings visibility supports the final recommendation because revenue quality and margin resilience remain aligned with the selected time horizon",
            "The risk reward profile is acceptable only when fresh price data confirms entry discipline and vendor data quality remains usable",
            "Position sizing should stay controlled because volatility, valuation sensitivity, and market liquidity can reduce conviction if momentum weakens",
        ],
        key_catalysts=[
            "News flow and catalyst quality should be monitored for confirmation before increasing exposure",
        ],
        final_decision="Hold",
        decision="Hold",
        trade_plan_valid=False,
    )

    parsed = _parse_final_result("summary", decision, PortfolioRating, {"last_close_price": 100.0})

    paragraph = parsed["key_reasons_paragraph"]
    assert isinstance(paragraph, str)
    assert paragraph
    assert "+" not in paragraph
    assert "\n" not in paragraph
    assert _count_words(paragraph) <= 125
    assert parsed["analysis_overview"]["key_reasons_paragraph"] == paragraph


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


def test_summary_and_parse_final_result_preserve_phase_2_fundamentals():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result
    from routes.serializers import shape_result

    fundamentals = {
        "financial_trends": {"periods": [{"key": "FY25"}]},
        "valuation_multiples": {"pe": 10},
        "fair_value_range": {"base": 100},
        "scenario_analysis": {"base": {"fair_value": 100}},
        "quality_of_earnings": {"rating": "healthy"},
        "balance_sheet_risk": {"risk_level": "low"},
        "dividend_quality": {"sustainability": "sustainable"},
        "peer_comparison": {"metrics": [{"ticker": "NVDA"}]},
    }

    shaped = shape_result({"decision": "Hold", **fundamentals}, "summary")
    parsed = _parse_final_result("", None, PortfolioRating, fundamentals)

    for key, value in fundamentals.items():
        assert shaped[key] == value
        assert parsed[key] == value


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


def test_summary_shape_keeps_price_chart():
    from routes.serializers import shape_result

    price_chart = {"available": True, "ticker": "BBCA.JK", "points": [{"date": "2026-05-18", "close": 100.0}]}

    shaped = shape_result({"decision": "Hold", "price_chart": price_chart}, "summary")

    assert shaped["price_chart"] == price_chart


def test_parse_final_result_preserves_price_chart():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    price_chart = {"available": False, "ticker": "AAPL", "warning": "offline"}
    parsed = _parse_final_result("", None, PortfolioRating, {"price_chart": price_chart})

    assert parsed["price_chart"] == price_chart


def test_summary_shape_keeps_related_news():
    from routes.serializers import shape_result

    related_news = {
        "available": True,
        "ticker": "BBCA.JK",
        "items": [{"title": "Headline", "url": "https://example.com/news"}],
    }

    shaped = shape_result({"decision": "Hold", "related_news": related_news}, "summary")

    assert shaped["related_news"] == related_news


def test_parse_final_result_preserves_related_news():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    related_news = {"available": False, "ticker": "AAPL", "items": [], "warning": "offline"}
    parsed = _parse_final_result("", None, PortfolioRating, {"related_news": related_news})

    assert parsed["related_news"] == related_news


def test_summary_shape_keeps_news_context():
    from routes.serializers import shape_result

    news = {"ticker": "BBCA.JK", "articles": [{"provider": "marketaux", "title": "Headline"}]}

    shaped = shape_result({"decision": "Hold", "news": news, "news_context": news}, "summary")

    assert shaped["news"] == news
    assert shaped["news_context"] == news


def test_parse_final_result_preserves_news_context():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    news = {"ticker": "BBCA.JK", "articles": [{"provider": "marketaux", "title": "Headline"}]}
    parsed = _parse_final_result("", None, PortfolioRating, {"news": news})

    assert parsed["news"] == news
    assert parsed["news_context"] == news


def test_parse_final_result_fallback_contract_is_non_actionable():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    parsed = _parse_final_result("", None, PortfolioRating, {"trade_date": "2026-05-18"})

    assert parsed["current_price"] is None
    assert parsed["current_price_as_of"] is None
    assert parsed["trade_plan_valid"] is False
    assert parsed["decision"] == "Hold"
    assert parsed["final_decision"] == "Hold"
    assert parsed["rebalancing_action"] == "No position to rebalance"
    assert parsed["position_size_hint"] == "0% allocation until setup improves."
    assert parsed["decision_adjusted"] is False
    assert parsed["validation_warnings"] == []
    assert parsed["data_quality"]["price_data"] == "missing"


def test_parse_final_result_preserves_profile_price_fallback_fields():
    from tradingagents.agents.schemas import PortfolioRating

    from routes.analysis import _parse_final_result

    parsed = _parse_final_result(
        "",
        None,
        PortfolioRating,
        {
            "trade_date": "2026-06-09",
            "last_close_price": 2690.0,
            "last_close_price_as_of": "2026-06-09",
            "last_close_price_source": "company_profile.current_price",
            "price_source": "company_profile.current_price",
            "price_timestamp": "2026-06-09",
            "price_is_fallback": True,
        },
    )

    assert parsed["current_price"] == 2690.0
    assert parsed["current_price_as_of"] == "2026-06-09"
    assert parsed["current_price_source"] == "company_profile.current_price"
    assert parsed["price_timestamp"] == "2026-06-09"
    assert parsed["price_is_fallback"] is True
    assert parsed["data_quality"]["trade_levels"] == "invalid"
    assert parsed["data_quality"]["llm_output"] == "fallback"
    assert parsed["data_quality"]["volatility_data"] == "missing"


def test_parse_final_result_wait_without_position_uses_no_position_copy():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    from routes.analysis import _parse_final_result

    decision = PortfolioDecision(
        confidence_score=0.55,
        rating=PortfolioRating.HOLD,
        executive_summary=_valid_executive_summary(),
        investment_thesis=_valid_investment_thesis(),
        final_decision="Hold",
        decision="Hold",
        trade_plan_valid=False,
        has_existing_position=False,
        position_quantity=None,
        average_entry_price=None,
    )

    parsed = _parse_final_result("", decision, PortfolioRating, {"last_close_price": 4800})

    assert parsed["display_signal"] == "WAIT"
    assert parsed["rebalancing_action"] == "No position to rebalance"
    assert parsed["new_entry_action"] == "Wait for valid entry setup"
    assert parsed["position_size_hint"] == "0% allocation until setup improves."
    assert parsed["position_action"] is None


def test_parse_final_result_reduce_existing_position_from_trim_action():
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    from routes.analysis import _parse_final_result

    decision = PortfolioDecision(
        confidence_score=0.55,
        rating=PortfolioRating.SELL,
        executive_summary=_valid_executive_summary(),
        investment_thesis=_valid_investment_thesis(),
        final_decision="Sell",
        decision="Sell",
        trade_plan_valid=True,
        has_existing_position=True,
        position_quantity=1000,
        average_entry_price=1670,
        rebalancing_action="Trim position",
        position_action="Trim position",
        new_entry_action="Do not add; reduce existing exposure",
        position_size_hint="Reduce position size gradually; no new exposure suggested.",
    )

    parsed = _parse_final_result("", decision, PortfolioRating, {"last_close_price": 1400})

    assert parsed["display_signal"] == "REDUCE"
    assert parsed["rebalancing_action"] == "Trim position"
    assert parsed["new_entry_action"] == "Do not add; reduce existing exposure"
    assert parsed["position_size_hint"] == "Reduce position size gradually; no new exposure suggested."
    assert parsed["position_action"] == "Trim position"


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


def test_parse_final_result_warns_when_portfolio_payload_falls_back(caplog):
    from routes.analysis import _parse_final_result

    parsed = _parse_final_result("fallback text", {}, None, {"last_close_price": 100.0})

    assert "Portfolio decision payload could not be parsed; fallback response was used." in parsed["warnings"]
    assert "Portfolio decision payload could not be parsed" in caplog.text
