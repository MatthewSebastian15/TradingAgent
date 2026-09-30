from __future__ import annotations

import math

import pytest

from tradingagents.trade_realism import (
    adjusted_atr,
    cap_price_target,
    expected_move,
    horizon_trading_days,
    structure_risk_distance,
    target_realism,
)


def _bar(high, low, close, factor=1.0):
    return {
        "high": high,
        "low": low,
        "close": close,
        "adjusted_close": close * factor,
        "adjustment_factor": factor,
    }


def test_adjusted_atr_ignores_split_gap():
    pre_split = [_bar(202, 198, 200, factor=0.5) for _ in range(10)]
    post_split = [_bar(101, 99, 100) for _ in range(10)]
    assert adjusted_atr(pre_split + post_split) == pytest.approx(2.0)


def test_horizon_days_and_expected_move():
    assert horizon_trading_days(3) == 63
    assert horizon_trading_days(None) == 21
    assert expected_move(2.0, 63) == pytest.approx(2.0 * math.sqrt(63))


def test_structure_stop_uses_support_with_buffer_and_atr_floor():
    assert structure_risk_distance(100.0, 95.0, 2.0, direction="long") == pytest.approx(5.5)
    assert structure_risk_distance(100.0, 99.5, 2.0, direction="long") == pytest.approx(3.0)
    assert structure_risk_distance(100.0, 105.0, 2.0, direction="short") == pytest.approx(5.5)


def test_structure_stop_too_wide_returns_none():
    assert structure_risk_distance(100.0, 80.0, 2.0, direction="long") is None


def test_target_realism_rejects_target_beyond_expected_move():
    ok, warnings = target_realism(
        entry=100.0,
        take_profit=116.5,
        atr=2.0,
        trading_days=21,
        blocking_level=None,
        direction="long",
    )
    assert ok is False
    assert "TAKE_PROFIT_BEYOND_EXPECTED_MOVE" in warnings


def test_target_realism_warns_when_resistance_sits_between():
    ok, warnings = target_realism(
        entry=100.0,
        take_profit=110.0,
        atr=2.0,
        trading_days=126,
        blocking_level=104.0,
        direction="long",
    )
    assert ok is True
    assert warnings == ["TARGET_BEHIND_RESISTANCE"]


def test_price_target_is_capped_at_two_expected_moves():
    capped, was_capped = cap_price_target(
        200.0, entry=100.0, atr=2.0, trading_days=126, direction="long"
    )
    assert was_capped is True
    assert capped == pytest.approx(100.0 + 4.0 * math.sqrt(126))
    same, not_capped = cap_price_target(
        110.0, entry=100.0, atr=2.0, trading_days=126, direction="long"
    )
    assert (same, not_capped) == (110.0, False)
