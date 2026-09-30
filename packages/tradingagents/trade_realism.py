from __future__ import annotations

import math
from typing import Any

MIN_STOP_ATR_MULTIPLE = 1.5
SUPPORT_BUFFER_ATR = 0.25
MIN_RISK_PCT = 0.01
MAX_RISK_PCT = 0.15
TARGET_MAX_EXPECTED_MOVES = 1.0
PRICE_TARGET_MAX_EXPECTED_MOVES = 2.0
TRADING_DAYS_PER_MONTH = 21


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def adjusted_atr(rows: list[dict[str, Any]] | None, window: int = 14) -> float | None:
    """ATR on split/dividend-adjusted OHLC so a corporate action cannot inflate the range."""
    bars: list[tuple[float, float, float]] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        factor = _number(row.get("adjustment_factor")) or 1.0
        high, low = _number(row.get("high")), _number(row.get("low"))
        close = _number(row.get("adjusted_close")) or _number(row.get("close"))
        if high is None or low is None or close is None or high < low or close <= 0:
            continue
        bars.append((high * factor, low * factor, close))
    if len(bars) < 2:
        return None
    ranges: list[float] = []
    previous_close = bars[0][2]
    for high, low, close in bars[1:]:
        ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
        previous_close = close
    recent = ranges[-window:]
    atr = sum(recent) / len(recent)
    return atr if atr > 0 else None


def horizon_trading_days(time_horizon_months: float | int | None) -> int:
    months = _number(time_horizon_months) or 1.0
    return max(1, round(months * TRADING_DAYS_PER_MONTH))


def expected_move(atr: float, trading_days: int) -> float:
    return atr * math.sqrt(max(1, trading_days))


def structure_risk_distance(
    entry: float, level: float | None, atr: float, *, direction: str
) -> float | None:
    floor = MIN_STOP_ATR_MULTIPLE * atr
    if level is None:
        distance = floor
    elif direction == "long":
        distance = max(floor, entry - (level - SUPPORT_BUFFER_ATR * atr))
    else:
        distance = max(floor, (level + SUPPORT_BUFFER_ATR * atr) - entry)
    distance = max(distance, entry * MIN_RISK_PCT)
    return None if distance > entry * MAX_RISK_PCT else distance


def target_realism(
    *,
    entry: float,
    take_profit: float,
    atr: float,
    trading_days: int,
    blocking_level: float | None,
    direction: str,
) -> tuple[bool, list[str]]:
    warnings: list[str] = []
    limit = expected_move(atr, trading_days) * TARGET_MAX_EXPECTED_MOVES
    realistic = abs(take_profit - entry) <= limit
    if not realistic:
        warnings.append("TAKE_PROFIT_BEYOND_EXPECTED_MOVE")
    if blocking_level is not None:
        if direction == "long" and entry < blocking_level < take_profit:
            warnings.append("TARGET_BEHIND_RESISTANCE")
        if direction == "short" and take_profit < blocking_level < entry:
            warnings.append("TARGET_BEHIND_SUPPORT")
    return realistic, warnings


def cap_price_target(
    target: float | None, *, entry: float, atr: float, trading_days: int, direction: str
) -> tuple[float | None, bool]:
    if target is None:
        return None, False
    limit = expected_move(atr, trading_days) * PRICE_TARGET_MAX_EXPECTED_MOVES
    if direction == "long" and target - entry > limit:
        return entry + limit, True
    if direction == "short" and entry - target > limit:
        return entry - limit, True
    return target, False
