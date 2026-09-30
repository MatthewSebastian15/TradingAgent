from __future__ import annotations

import math

import pytest

from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
from tradingagents.trade_levels import normalize_trade_levels


def _decision(**overrides) -> PortfolioDecision:
    data = {
        "confidence_score": 0.8,
        "rating": PortfolioRating.BUY,
        "executive_summary": "word " * 200,
        "investment_thesis": "reason " * 300,
        "suggested_allocation_percent": 2.0,
        "risk_reward_ratio": 3.0,
        "volatility_level": "Medium",
        "price_target": 120.0,
    }
    data.update(overrides)
    return PortfolioDecision(**data)


TECH = {"support": 95.0, "resistance": 130.0, "atr": 2.0}


def test_long_stop_sits_below_support_and_target_is_three_r():
    result = normalize_trade_levels(
        _decision(), 100.0, ticker="AAPL", technical_entry=TECH, time_horizon_months=6
    )
    assert result.trade_plan_valid is True
    assert result.stop_loss == pytest.approx(94.5)
    assert result.take_profit == pytest.approx(116.5)
    assert result.risk_reward_display == "1:3"


def test_short_horizon_unrealistic_target_downgrades_to_hold():
    result = normalize_trade_levels(
        _decision(), 100.0, ticker="AAPL", technical_entry=TECH, time_horizon_months=1
    )
    assert result.final_decision == "Hold"
    assert "TAKE_PROFIT_BEYOND_EXPECTED_MOVE" in result.validation_warnings
    assert "expected move" in (result.decision_adjusted_reason or "")


def test_support_too_far_makes_setup_untradeable():
    result = normalize_trade_levels(
        _decision(),
        100.0,
        ticker="AAPL",
        technical_entry={**TECH, "support": 80.0},
        time_horizon_months=6,
    )
    assert result.final_decision == "Hold"
    assert "STOP_TOO_WIDE_FOR_STRUCTURE" in result.validation_warnings


def test_price_target_is_capped():
    result = normalize_trade_levels(
        _decision(price_target=250.0),
        100.0,
        ticker="AAPL",
        technical_entry=TECH,
        time_horizon_months=6,
    )
    assert "PRICE_TARGET_CAPPED" in result.validation_warnings
    assert result.price_target == pytest.approx(round(100.0 + 4.0 * math.sqrt(126), 2))


def test_resistance_between_entry_and_target_only_warns():
    result = normalize_trade_levels(
        _decision(),
        100.0,
        ticker="AAPL",
        technical_entry={**TECH, "resistance": 105.0},
        time_horizon_months=6,
    )
    assert result.trade_plan_valid is True
    assert "TARGET_BEHIND_RESISTANCE" in result.validation_warnings


def test_weak_entry_quality_waits_with_entry_zone():
    result = normalize_trade_levels(
        _decision(),
        100.0,
        ticker="AAPL",
        technical_entry={**TECH, "entry_quality_score": 4.0},
        time_horizon_months=6,
    )
    assert result.final_decision == "Hold"
    assert "ENTRY_QUALITY_WAIT" in result.validation_warnings
    assert result.entry_zone_low == pytest.approx(98.0)
    assert result.entry_zone_high == pytest.approx(99.5)
    assert "4.0/10" in result.decision_adjusted_reason


def test_drawdown_uses_stop_distance_and_history():
    result = normalize_trade_levels(
        _decision(),
        100.0,
        ticker="AAPL",
        technical_entry=TECH,
        time_horizon_months=6,
        historical_max_drawdown_pct=-18.2,
    )
    assert result.max_drawdown_min_pct == pytest.approx(5.5)
    assert result.max_drawdown_max_pct == pytest.approx(18.2)


def test_allocation_is_capped_by_volatility_confidence_and_earnings():
    result = normalize_trade_levels(
        _decision(suggested_allocation_percent=25.0, confidence_score=0.8),
        100.0,
        ticker="AAPL",
        technical_entry={**TECH, "earnings_within_days": 5},
        time_horizon_months=6,
    )
    assert result.allocation_cap_percent == pytest.approx(2.5)  # Medium 7 * 0.8 = 5.6 / 2 -> 2.5
    assert result.suggested_allocation_percent == pytest.approx(2.5)
    assert "ALLOCATION_CAPPED" in result.validation_warnings
    assert "ALLOCATION_HALVED_FOR_EARNINGS" in result.validation_warnings
