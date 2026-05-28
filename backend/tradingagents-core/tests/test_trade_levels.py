from __future__ import annotations

import pytest

from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
from tradingagents.trade_levels import normalize_trade_levels


def make_decision(**overrides) -> PortfolioDecision:
    data = {
        "confidence_score": 0.75,
        "rating": PortfolioRating.BUY,
        "decision": None,
        "executive_summary": (
            "The setup is constructive because the trend is supportive. "
            "The strongest data point is a valid risk plan. "
            "The main risk is volatility, so sizing should stay controlled."
        ),
        "investment_thesis": (
            "The company has a clear setup. The price trend is supportive. "
            "The market context is acceptable. The risk is defined through a stop loss. "
            "The reward target is measurable. The thesis should be reviewed if the setup breaks."
        ),
        "suggested_allocation_percent": 5.0,
        "entry_price": 100.0,
        "stop_loss": 95.0,
        "take_profit": 110.0,
        "risk_reward_ratio": 2.0,
        "max_drawdown_estimate": "8-12%",
        "volatility_level": "High",
        "position_sizing_reason": "Use controlled size.",
        "rebalancing_action": "Add gradually",
        "key_catalysts": ["Earnings"],
        "invalidation_conditions": ["Breaks support"],
        "price_target": 115.0,
        "time_horizon": "3 months",
    }
    data.update(overrides)
    return PortfolioDecision(**data)


@pytest.mark.parametrize("raw_rr", [None, 0.0, 2.0, 4.0, 5.0, 7.0])
def test_buy_always_forces_risk_reward_to_one_to_three(raw_rr):
    decision = make_decision(risk_reward_ratio=raw_rr, stop_loss=95.0, price_target=130.0)

    normalized = normalize_trade_levels(decision, 100.0, ticker="NVDA", current_price_as_of="2026-05-18")

    assert normalized.final_decision == "Buy"
    assert normalized.trade_plan_valid is True
    assert normalized.risk_reward_ratio == pytest.approx(3.0)
    assert normalized.risk_reward_display == "1:3"
    assert normalized.risk_per_share == pytest.approx(5.0)
    assert normalized.reward_per_share == pytest.approx(15.0)
    assert normalized.take_profit == pytest.approx(115.0)
    assert "RR_FORCED_TO_3" in normalized.validation_warnings


def test_buy_with_exact_rr_three_does_not_add_rr_warning():
    decision = make_decision(risk_reward_ratio=3.0, stop_loss=95.0)

    normalized = normalize_trade_levels(decision, 100.0, ticker="NVDA")

    assert normalized.final_decision == "Buy"
    assert normalized.trade_plan_valid is True
    assert normalized.risk_reward_ratio == pytest.approx(3.0)
    assert normalized.risk_reward_display == "1:3"
    assert normalized.take_profit == pytest.approx(115.0)
    assert "RR_FORCED_TO_3" not in normalized.validation_warnings


@pytest.mark.parametrize("raw_rr", [2.0, 4.0, 5.0, 7.0])
def test_sell_always_forces_risk_reward_to_one_to_three(raw_rr):
    decision = make_decision(
        rating=PortfolioRating.SELL,
        decision="Sell",
        entry_price=100.0,
        stop_loss=105.0,
        take_profit=96.0,
        risk_reward_ratio=raw_rr,
        price_target=85.0,
        volatility_level="Very High",
        rebalancing_action="Exit position",
    )

    normalized = normalize_trade_levels(decision, 100.0, ticker="TSLA", has_existing_position=True)

    assert normalized.final_decision == "Sell"
    assert normalized.trade_plan_valid is True
    assert normalized.stop_loss > normalized.entry_price
    assert normalized.take_profit < normalized.entry_price
    assert normalized.risk_reward_ratio == pytest.approx(3.0)
    assert normalized.risk_reward_display == "1:3"
    assert normalized.risk_per_share == pytest.approx(7.0)
    assert normalized.reward_per_share == pytest.approx(21.0)
    assert normalized.take_profit == pytest.approx(79.0)
    assert normalized.rebalancing_action == "Exit position"
    assert "RR_FORCED_TO_3" in normalized.validation_warnings


def test_missing_current_price_downgrades_actionable_decision_to_hold():
    decision = make_decision(risk_reward_ratio=3.0)

    normalized = normalize_trade_levels(decision, None, ticker="NVDA")

    assert normalized.final_decision == "Hold"
    assert normalized.decision == "Hold"
    assert normalized.trade_plan_valid is False
    assert normalized.decision_adjusted is True
    assert normalized.decision_adjusted_reason == "Missing current price"
    assert normalized.current_price is None
    assert "CURRENT_PRICE_MISSING" in normalized.validation_warnings
    assert "DECISION_DOWNGRADED_TO_HOLD" in normalized.validation_warnings


def test_invalid_volatility_and_rebalancing_are_normalized():
    decision = make_decision(
        volatility_level="Moderate",
        volatility_score=None,
        rebalancing_action="Exit position",
    )

    normalized = normalize_trade_levels(decision, 100.0, ticker="NVDA")

    assert normalized.volatility_level == "Medium"
    assert normalized.rebalancing_action == "Open new position"
    assert "INVALID_VOLATILITY_FIXED" in normalized.validation_warnings
    assert "INVALID_REBALANCING_FIXED" in normalized.validation_warnings


def test_sell_without_existing_position_does_not_use_exit_or_reduce_action():
    decision = make_decision(
        rating=PortfolioRating.SELL,
        decision="Sell",
        volatility_level="Very High",
        rebalancing_action="Exit position",
        entry_price=100.0,
        stop_loss=105.0,
        price_target=85.0,
        risk_reward_ratio=3.0,
    )

    normalized = normalize_trade_levels(decision, 100.0, ticker="TSLA", has_existing_position=False)

    assert normalized.final_decision == "Sell"
    assert normalized.trade_plan_valid is True
    assert normalized.rebalancing_action == "Avoid new entry"
    assert normalized.position_action is None
    assert normalized.new_entry_action == "Avoid new entry"


def test_hold_clears_trade_levels_from_user_facing_contract():
    decision = make_decision(
        rating=PortfolioRating.HOLD,
        decision="Hold",
        volatility_level="High",
        rebalancing_action="Exit position",
    )

    normalized = normalize_trade_levels(decision, 100.0, ticker="AAPL")

    assert normalized.final_decision == "Hold"
    assert normalized.trade_plan_valid is False
    assert normalized.current_price == 100.0
    assert normalized.rebalancing_action == "Avoid new entry"
    assert normalized.data_quality["trade_levels"] == "hidden"
    assert normalized.entry_price is None
    assert normalized.stop_loss is None
    assert normalized.take_profit is None
    assert normalized.risk_reward_ratio is None
    assert normalized.risk_reward_display is None


def test_indonesia_ticker_uses_tick_size_rounding():
    decision = make_decision(
        entry_price=9803.0,
        stop_loss=9299.0,
        risk_reward_ratio=3.0,
        price_target=11601.0,
        volatility_level="High",
        rebalancing_action="Open new position",
    )

    normalized = normalize_trade_levels(decision, 9803.0, ticker="BBCA.JK")

    assert normalized.entry_price % 25 == 0
    assert normalized.stop_loss % 25 == 0
    assert normalized.take_profit % 25 == 0
    assert "INDONESIA_TICK_SIZE_ROUNDED" in normalized.validation_warnings
