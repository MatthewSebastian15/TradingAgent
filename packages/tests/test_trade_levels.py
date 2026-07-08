from __future__ import annotations

import pytest

from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
from tradingagents.trade_levels import normalize_trade_levels


def _valid_executive_summary() -> str:
    return (
        "The final rating is Hold because the available evidence is balanced and the setup does "
        + "not justify forcing a new position before confirmation improves. The strongest support "
        + "comes from stable price behavior, controlled downside assumptions, and a risk plan that "
        + "keeps capital protected while the next catalyst develops. The biggest risk is "
        + "incomplete data or weak confirmation, because either problem could turn a neutral setup "
        + "into a poor trade. The recommended action is to keep allocation modest, avoid adding "
        + "size, wait for a cleaner entry, and only use a stop loss after price data confirms the "
        + "setup. The expected horizon is short to medium term, and the thesis should be confirmed "
        + "by stronger trend evidence or invalidated by a break below support. It also names the "
        + "rating, support, risk, action plan, sizing posture, stop context, time horizon, and "
        + "invalidation logic so the object behaves like a real portfolio manager response. The "
        + "wording is deliberately reusable so schema validation remains stable across parse, "
        + "memory, and trade level tests without changing assertions. The summary also includes "
        + "enough realistic context to satisfy production length checks, because short "
        + "placeholders are dangerous when the schema is deliberately strict. It explains that "
        + "allocation should remain conservative, that price confirmation matters more than "
        + "narrative confidence, and that the user should avoid pretending a watchlist idea is "
        + "already a validated trade. This extra detail keeps test fixtures aligned with the same "
        + "narrative contract used by real analysis responses. It also confirms that action "
        + "wording, risk posture, position context, and validation behavior can be tested together "
        + "without inventing a live recommendation."
    )


def _valid_investment_thesis() -> str:
    return (
        "The investment thesis is intentionally cautious because the available evidence supports "
        + "patience more than immediate action. The company remains relevant in its market, but "
        + "the current setup needs stronger confirmation before it deserves a larger allocation. "
        + "The most useful signals are stable price behavior, controlled risk assumptions, and a "
        + "trade plan that avoids oversized exposure while waiting for the next catalyst. Those "
        + "signals are helpful, but they are not strong enough to justify a high conviction Buy "
        + "without cleaner momentum, better data quality, and a more attractive entry point. The "
        + "bear case is that weak confirmation, stale inputs, or sudden volatility could quickly "
        + "damage the risk reward profile. That bear case matters because a trade can be "
        + "directionally reasonable and still be poor if the entry is late or the stop loss is not "
        + "respected. The balanced conclusion is to wait, keep allocation limited, and require "
        + "stronger evidence before increasing exposure. The action plan is to avoid chasing "
        + "price, use a smaller position only if the setup improves, define the stop loss before "
        + "entry, and take profit only when the validated risk reward target is reached. If the "
        + "next catalyst confirms stronger demand and price stability, the thesis can be upgraded; "
        + "if support breaks, the idea should be rejected. This helper also keeps tests readable "
        + "by using one reusable narrative instead of scattering short invalid placeholders across "
        + "unrelated assertions. The exact company is not important here; what matters is that "
        + "schema validation, parsing, serialization, and trade level normalization all receive "
        + "text that matches the production contract. The mock company is assumed to have an "
        + "understandable business model, reasonable liquidity, and enough public information for "
        + "a normal research workflow, but conviction remains limited because the evidence is "
        + "deliberately neutral. Price action is described as stable rather than decisive, which "
        + "means support and resistance levels should guide action more than broad company "
        + "quality. Fundamentals are treated as acceptable but not powerful enough to overwhelm "
        + "timing risk, so revenue, margin, balance sheet, and cash flow details should be "
        + "monitored before any upgrade. Technical confirmation is also required because a good "
        + "business can still be a poor short term trade when volatility rises or entry quality "
        + "deteriorates. The preferred outcome is a patient watchlist stance that becomes "
        + "actionable only after price, data quality, and risk reward all improve together. The "
        + "downside case would gain force if support fails, if financial updates disappoint, or if "
        + "market liquidity weakens. The upside case would gain force if catalysts arrive with "
        + "stronger volume, cleaner earnings quality, and a valid entry setup. Until then, the "
        + "correct conclusion is disciplined patience, not heroic improvisation dressed up as "
        + "portfolio management."
    )


def make_decision(**overrides) -> PortfolioDecision:
    data = {
        "confidence_score": 0.75,
        "rating": PortfolioRating.BUY,
        "decision": None,
        "executive_summary": _valid_executive_summary(),
        "investment_thesis": _valid_investment_thesis(),
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

    normalized = normalize_trade_levels(
        decision, 100.0, ticker="NVDA", current_price_as_of="2026-05-18"
    )

    assert normalized.final_decision == "Buy"
    assert normalized.trade_plan_valid is True
    assert normalized.risk_reward_ratio == pytest.approx(3.0)
    assert normalized.risk_reward_display == "1:3"
    assert normalized.risk_per_share == pytest.approx(5.0)
    assert normalized.reward_per_share == pytest.approx(15.0)
    assert normalized.take_profit == pytest.approx(115.0)
    assert "RR_FORCED_TO_3" in normalized.validation_warnings


def test_normalize_honors_non_default_target_risk_reward():
    # 9B: a non-default TARGET_RISK_REWARD reshapes reward/take-profit and display.
    decision = make_decision(risk_reward_ratio=3.0, stop_loss=95.0)

    normalized = normalize_trade_levels(decision, 100.0, ticker="NVDA", target_risk_reward=2.0)

    assert normalized.risk_reward_ratio == pytest.approx(2.0)
    assert normalized.risk_reward_display == "1:2"
    assert normalized.risk_per_share == pytest.approx(5.0)
    assert normalized.reward_per_share == pytest.approx(10.0)
    assert normalized.take_profit == pytest.approx(110.0)
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
    assert normalized.rebalancing_action == "No position to rebalance"
    assert normalized.position_action is None
    assert normalized.new_entry_action == "Avoid entry; wait for risk to normalize"


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
    assert normalized.rebalancing_action == "No position to rebalance"
    assert normalized.data_quality["trade_levels"] == "hidden"
    assert normalized.entry_price is None
    assert normalized.stop_loss is None
    assert normalized.take_profit is None
    assert normalized.risk_reward_ratio is None
    assert normalized.risk_reward_display is None


def test_no_existing_position_buy_valid_opens_new_position():
    decision = make_decision(
        rating=PortfolioRating.BUY,
        decision="Buy",
        entry_price=100.0,
        stop_loss=95.0,
        take_profit=115.0,
        risk_reward_ratio=3.0,
        confidence_score=0.8,
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=False,
        position_quantity=None,
    )

    assert normalized.has_existing_position is False
    assert normalized.rebalancing_action == "Open new position"
    assert normalized.position_action is None
    assert normalized.new_entry_action == "Allowed with validated entry"
    assert normalized.position_size_hint == "Use standard starter size and avoid oversized entry."


def test_no_existing_position_hold_avoids_new_entry():
    decision = make_decision(
        rating=PortfolioRating.HOLD,
        decision="Hold",
        confidence_score=0.6,
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=False,
    )

    assert normalized.has_existing_position is False
    assert normalized.rebalancing_action == "No position to rebalance"
    assert normalized.position_action is None
    assert normalized.new_entry_action == "Wait for valid entry setup"
    assert normalized.position_size_hint == "0% allocation until setup improves."


def test_no_existing_position_sell_avoids_new_entry_not_exit():
    decision = make_decision(
        rating=PortfolioRating.SELL,
        decision="Sell",
        entry_price=100.0,
        stop_loss=105.0,
        take_profit=85.0,
        risk_reward_ratio=3.0,
        confidence_score=0.9,
        volatility_level="High",
        rebalancing_action="Exit position",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=False,
    )

    assert normalized.has_existing_position is False
    assert normalized.rebalancing_action == "No position to rebalance"
    assert normalized.position_action is None
    assert normalized.new_entry_action == "Avoid entry; wait for risk to normalize"
    assert (
        normalized.position_size_hint
        == "0% allocation; stay on watchlist only until risk normalizes."
    )
    assert "INVALID_REBALANCING_FIXED" in normalized.validation_warnings


def test_existing_position_buy_valid_adds_position():
    decision = make_decision(
        rating=PortfolioRating.BUY,
        decision="Buy",
        entry_price=100.0,
        stop_loss=95.0,
        take_profit=115.0,
        risk_reward_ratio=3.0,
        confidence_score=0.8,
        volatility_level="Low",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=100,
        average_entry_price=92.0,
    )

    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Add position"
    assert normalized.position_action == "Add position"
    assert normalized.new_entry_action == "No separate new entry; add only to existing position"
    assert (
        normalized.position_size_hint
        == "Add to existing position gradually; normal add size may be acceptable."
    )


def test_existing_position_buy_low_confidence_maintains_position():
    decision = make_decision(
        rating=PortfolioRating.BUY,
        decision="Buy",
        entry_price=100.0,
        stop_loss=95.0,
        take_profit=115.0,
        risk_reward_ratio=3.0,
        confidence_score=0.5,
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=100,
    )

    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Maintain position"
    assert normalized.position_action == "Maintain position"
    assert normalized.new_entry_action == "No new entry; maintain existing position"
    assert (
        normalized.position_size_hint
        == "Maintain current position size; no additional exposure suggested."
    )


def test_existing_position_hold_maintains_position():
    decision = make_decision(
        rating=PortfolioRating.HOLD,
        decision="Hold",
        confidence_score=0.6,
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=100,
    )

    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Maintain position"
    assert normalized.position_action == "Maintain position"
    assert normalized.new_entry_action == "No new entry; maintain existing position"
    assert (
        normalized.position_size_hint
        == "Maintain current position size; no additional exposure suggested."
    )


def test_existing_position_sell_high_confidence_exits_position():
    decision = make_decision(
        rating=PortfolioRating.SELL,
        decision="Sell",
        entry_price=100.0,
        stop_loss=105.0,
        take_profit=85.0,
        risk_reward_ratio=3.0,
        confidence_score=0.8,
        volatility_level="High",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=100,
    )

    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Exit position"
    assert normalized.position_action == "Exit position"
    assert normalized.new_entry_action == "No new entry; exit existing position"
    assert normalized.position_size_hint == "Exit existing position; no new exposure suggested."


def test_existing_position_sell_low_confidence_trims_position():
    decision = make_decision(
        rating=PortfolioRating.SELL,
        decision="Sell",
        entry_price=100.0,
        stop_loss=105.0,
        take_profit=85.0,
        risk_reward_ratio=3.0,
        confidence_score=0.5,
        volatility_level="Very High",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=100,
    )

    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Trim position"
    assert normalized.position_action == "Trim position"
    assert normalized.new_entry_action == "Do not add; reduce existing exposure"
    assert (
        normalized.position_size_hint
        == "Reduce exposure aggressively or prepare full exit if risk worsens."
    )


def test_position_quantity_overrides_false_existing_position_flag():
    decision = make_decision(
        rating=PortfolioRating.HOLD,
        decision="Hold",
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=False,
        position_quantity=100,
    )

    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Maintain position"
    assert normalized.position_action == "Maintain position"
    assert normalized.new_entry_action == "No new entry; maintain existing position"
    assert "POSITION_FLAG_CONFLICT_FIXED" in normalized.validation_warnings


def test_zero_position_quantity_overrides_true_existing_position_flag():
    decision = make_decision(
        rating=PortfolioRating.HOLD,
        decision="Hold",
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=0,
    )

    assert normalized.has_existing_position is False
    assert normalized.rebalancing_action == "No position to rebalance"
    assert normalized.position_action is None
    assert normalized.new_entry_action == "Wait for valid entry setup"
    assert "POSITION_FLAG_CONFLICT_FIXED" in normalized.validation_warnings


def test_negative_position_quantity_falls_back_to_flag_with_warning():
    decision = make_decision(
        rating=PortfolioRating.HOLD,
        decision="Hold",
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        100.0,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=-10,
    )

    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Maintain position"
    assert normalized.position_action == "Maintain position"
    assert "POSITION_QUANTITY_INVALID" in normalized.validation_warnings


def test_missing_price_no_position_sets_safe_new_entry_fields():
    decision = make_decision(
        rating=PortfolioRating.BUY,
        decision="Buy",
        confidence_score=0.8,
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        None,
        ticker="BBCA",
        has_existing_position=False,
    )

    assert normalized.final_decision == "Hold"
    assert normalized.has_existing_position is False
    assert normalized.rebalancing_action == "No position to rebalance"
    assert normalized.position_action is None
    assert normalized.new_entry_action == "Wait until valid price data is available"
    assert normalized.position_size_hint == "0% allocation until valid price data is available."


def test_missing_price_existing_position_maintains_position_fields():
    decision = make_decision(
        rating=PortfolioRating.BUY,
        decision="Buy",
        confidence_score=0.8,
        volatility_level="Medium",
    )

    normalized = normalize_trade_levels(
        decision,
        None,
        ticker="BBCA",
        has_existing_position=True,
        position_quantity=100,
    )

    assert normalized.final_decision == "Hold"
    assert normalized.has_existing_position is True
    assert normalized.rebalancing_action == "Maintain position"
    assert normalized.position_action == "Maintain position"
    assert normalized.new_entry_action == "No new entry until price data is valid"
    assert (
        normalized.position_size_hint
        == "Maintain current position size until valid price data is available."
    )


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
