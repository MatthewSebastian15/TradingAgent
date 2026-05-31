from __future__ import annotations


def test_analysis_summary_contract_includes_risk_engine_fields():
    from routes.serializers import SUMMARY_FIELDS

    expected_fields = {
        "current_price",
        "current_price_as_of",
        "current_price_source",
        "llm_decision",
        "final_decision",
        "decision_adjusted",
        "decision_adjusted_reason",
        "trade_plan_valid",
        "has_existing_position",
        "data_quality",
        "validation_warnings",
        "risk_reward_display",
        "risk_per_share",
        "reward_per_share",
        "volatility_level",
        "volatility_score",
        "rebalancing_action",
        "position_size_hint",
        "max_drawdown_min_pct",
        "max_drawdown_max_pct",
        "financial_highlights",
        "company_profile",
    }

    assert expected_fields.issubset(SUMMARY_FIELDS)
