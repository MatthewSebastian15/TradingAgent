from __future__ import annotations

import csv
import math
import re
from io import StringIO
from statistics import pstdev
from typing import Any

from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating, VolatilityLevel

MIN_RR = 3.0
MAX_RR = 5.0
DEFAULT_RR = 3.0
DEFAULT_DECISION = "Hold"
DEFAULT_VOLATILITY_LEVEL = "Medium"

VOLATILITY_LEVELS = {"Low", "Medium", "High", "Very High"}
ACTIONABLE_DECISIONS = {"Buy", "Overweight", "Sell", "Underweight"}
LONG_DECISIONS = {"Buy", "Overweight"}
SHORT_DECISIONS = {"Sell", "Underweight"}
POSITION_ACTIONS = {"Exit position", "Trim position", "Reduce exposure", "Hedge or reduce risk"}

REBALANCING_BY_DECISION_AND_VOLATILITY = {
    "Buy": {
        "Low": ["Accumulate", "Increase exposure"],
        "Medium": ["Add gradually", "Add on pullback"],
        "High": ["Buy with tight risk control", "Wait for better entry"],
        "Very High": ["Wait for better entry"],
    },
    "Overweight": {
        "Low": ["Accumulate", "Increase exposure"],
        "Medium": ["Add gradually", "Add on pullback"],
        "High": ["Buy with tight risk control", "Wait for better entry"],
        "Very High": ["Wait for better entry"],
    },
    "Sell": {
        "Low": ["Trim position", "Sell into strength"],
        "Medium": ["Reduce exposure", "Trim position"],
        "High": ["Reduce exposure", "Exit position"],
        "Very High": ["Exit position", "Avoid new entry"],
    },
    "Underweight": {
        "Low": ["Trim position", "Sell into strength"],
        "Medium": ["Reduce exposure", "Trim position"],
        "High": ["Reduce exposure", "Exit position"],
        "Very High": ["Exit position", "Avoid new entry"],
    },
    "Hold": {
        "Low": ["Hold existing exposure", "Watchlist only"],
        "Medium": ["Wait and monitor", "Wait for pullback"],
        "High": ["No new entry", "Review after next catalyst"],
        "Very High": ["No new entry", "Avoid new entry"],
    },
}

POSITION_SIZE_HINTS = {
    "Low": "Normal position size may be acceptable if trade plan is valid.",
    "Medium": "Use standard risk management and avoid oversized position.",
    "High": "Use smaller size due to High volatility.",
    "Very High": "Avoid aggressive sizing. Consider no new entry or very small size only.",
}

DRAWDOWN_BY_VOLATILITY = {
    "Low": (3.0, 6.0),
    "Medium": (6.0, 10.0),
    "High": (8.0, 12.0),
    "Very High": (12.0, 20.0),
}


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    return getattr(value, "value", value)


def _rating_from_text(text: str) -> PortfolioRating:
    try:
        return PortfolioRating(text)
    except ValueError:
        return PortfolioRating.HOLD


def _decision_text(decision: PortfolioDecision) -> str:
    raw = (
        getattr(decision, "final_decision", None)
        or getattr(decision, "decision", None)
        or _enum_value(getattr(decision, "rating", None))
        or DEFAULT_DECISION
    )
    return raw if raw in REBALANCING_BY_DECISION_AND_VOLATILITY else DEFAULT_DECISION


def _append_warning(warnings: list[str], warning: str | None) -> None:
    if warning and warning not in warnings:
        warnings.append(warning)


def clamp_rr(value: float | None) -> tuple[float, str | None]:
    try:
        numeric = float(value) if value is not None else None
    except (TypeError, ValueError):
        numeric = None
    if numeric is None or numeric <= 0:
        return DEFAULT_RR, "RR_CLAMPED_TO_3"
    if numeric < MIN_RR:
        return MIN_RR, "RR_CLAMPED_TO_3"
    if numeric > MAX_RR:
        return MAX_RR, "RR_CLAMPED_TO_5"
    return numeric, None


def get_idx_tick_size(price: float) -> int:
    if price < 200:
        return 1
    if price < 500:
        return 2
    if price < 2000:
        return 5
    if price < 5000:
        return 10
    return 25


def round_to_tick(price: float, tick_size: int) -> int:
    return int(round(price / tick_size) * tick_size)


def _is_indonesia_ticker(ticker: str | None) -> bool:
    return bool(ticker and ticker.upper().endswith(".JK"))


def _round_price(price: float | None, ticker: str | None, warnings: list[str]) -> float | int | None:
    if price is None:
        return None
    if not math.isfinite(float(price)) or price <= 0:
        return None
    if _is_indonesia_ticker(ticker):
        rounded = round_to_tick(float(price), get_idx_tick_size(float(price)))
        if abs(float(rounded) - float(price)) > 1e-9:
            _append_warning(warnings, "INDONESIA_TICK_SIZE_ROUNDED")
        return rounded
    return round(float(price), 2)


def _parse_price_rows(price_data: str | None) -> list[dict[str, float]]:
    lines = [line for line in (price_data or "").splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if not lines:
        return []
    rows: list[dict[str, float]] = []
    reader = csv.DictReader(StringIO("\n".join(lines)))
    for row in reader:
        try:
            close = float(str(row.get("Close") or row.get("Adj Close") or "").replace(",", ""))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(close) or close <= 0:
            continue
        parsed = {"close": close}
        for key, name in (("High", "high"), ("Low", "low"), ("Volume", "volume")):
            raw = row.get(key)
            try:
                value = float(str(raw or "").replace(",", ""))
            except (TypeError, ValueError):
                value = 0.0
            parsed[name] = value if math.isfinite(value) else 0.0
        rows.append(parsed)
    return rows


def calculate_volatility_score(price_data: str | None) -> float | None:
    rows = _parse_price_rows(price_data)
    if len(rows) < 5:
        return None
    window = rows[-20:]
    closes = [item["close"] for item in window]
    returns = [(closes[i] / closes[i - 1]) - 1 for i in range(1, len(closes)) if closes[i - 1] > 0]
    return_std_pct = pstdev(returns) * 100 if len(returns) >= 2 else 0.0

    ranges_pct = []
    for item in window:
        high = item.get("high") or 0.0
        low = item.get("low") or 0.0
        close = item["close"]
        if high > 0 and low > 0 and high >= low and close > 0:
            ranges_pct.append(((high - low) / close) * 100)
    avg_range_pct = sum(ranges_pct) / len(ranges_pct) if ranges_pct else 0.0

    last_close = closes[-1]
    range_20d_pct = ((max(closes) - min(closes)) / last_close) * 100 if last_close > 0 else 0.0

    volumes = [item.get("volume") or 0.0 for item in window if (item.get("volume") or 0.0) > 0]
    if len(volumes) >= 5:
        avg_volume = sum(volumes[:-1]) / max(len(volumes[:-1]), 1)
        volume_spike = volumes[-1] / avg_volume if avg_volume > 0 else 1.0
    else:
        volume_spike = 1.0

    atr_score = min(avg_range_pct * 9.0, 100.0)
    return_std_score = min(return_std_pct * 18.0, 100.0)
    range_score = min(range_20d_pct * 3.0, 100.0)
    volume_spike_score = min(max((volume_spike - 1.0) * 35.0, 0.0), 100.0)
    score = atr_score * 0.35 + return_std_score * 0.25 + range_score * 0.20 + volume_spike_score * 0.20
    return round(max(0.0, min(score, 100.0)), 2)


def normalize_volatility_level(volatility_score: float | None, raw_level: str | None) -> str:
    if volatility_score is not None:
        if volatility_score < 25:
            return "Low"
        if volatility_score < 50:
            return "Medium"
        if volatility_score < 75:
            return "High"
        return "Very High"
    if raw_level in VOLATILITY_LEVELS:
        return raw_level
    return DEFAULT_VOLATILITY_LEVEL


def normalize_rebalancing_action(
    decision: str | None,
    volatility_level: str,
    action: str | None,
    has_existing_position: bool,
) -> str:
    normalized_decision = decision if decision in REBALANCING_BY_DECISION_AND_VOLATILITY else DEFAULT_DECISION
    allowed_actions = list(REBALANCING_BY_DECISION_AND_VOLATILITY[normalized_decision][volatility_level])
    if has_existing_position is False:
        allowed_actions = [item for item in allowed_actions if item not in POSITION_ACTIONS]
        if not allowed_actions:
            allowed_actions = ["Avoid new entry"]
    if action in allowed_actions:
        return action
    return allowed_actions[0]


def _format_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def _parse_drawdown_range(value: str | None) -> tuple[float | None, float | None]:
    if not value:
        return None, None
    matches = [float(item) for item in re.findall(r"\d+(?:\.\d+)?", str(value))]
    if not matches:
        return None, None
    if len(matches) == 1:
        return matches[0], matches[0]
    low, high = matches[0], matches[1]
    return (min(low, high), max(low, high))


def _ensure_drawdown(decision: PortfolioDecision, volatility_level: str, warnings: list[str]) -> None:
    low = getattr(decision, "max_drawdown_min_pct", None)
    high = getattr(decision, "max_drawdown_max_pct", None)
    if low is None or high is None:
        low, high = _parse_drawdown_range(getattr(decision, "max_drawdown_estimate", None))
    if low is None or high is None or low <= 0 or high <= 0:
        low, high = DRAWDOWN_BY_VOLATILITY[volatility_level]
        _append_warning(warnings, "MAX_DRAWDOWN_RECOMPUTED")
    if low > high:
        low, high = high, low
    decision.max_drawdown_min_pct = float(low)
    decision.max_drawdown_max_pct = float(high)
    decision.max_drawdown_estimate = f"{_format_number(float(low))}-{_format_number(float(high))}%"


def _clear_trade_levels(decision: PortfolioDecision, warnings: list[str], *, add_hold_warning: bool = False) -> None:
    had_trade_level = any(
        getattr(decision, field, None) is not None
        for field in (
            "price_target",
            "entry_price",
            "stop_loss",
            "take_profit",
            "risk_reward_ratio",
            "risk_reward_display",
            "risk_per_share",
            "reward_per_share",
            "max_drawdown_estimate",
            "max_drawdown_min_pct",
            "max_drawdown_max_pct",
        )
    )
    decision.price_target = None
    decision.entry_price = None
    decision.stop_loss = None
    decision.take_profit = None
    decision.risk_reward_ratio = None
    decision.risk_reward_display = None
    decision.risk_per_share = None
    decision.reward_per_share = None
    decision.max_drawdown_estimate = None
    decision.max_drawdown_min_pct = None
    decision.max_drawdown_max_pct = None
    decision.trade_plan_valid = False
    if add_hold_warning and had_trade_level:
        _append_warning(warnings, "HOLD_TRADE_LEVELS_HIDDEN")


def _set_decision(decision: PortfolioDecision, final_decision: str) -> None:
    decision.final_decision = final_decision
    decision.decision = final_decision
    decision.rating = _rating_from_text(final_decision)


def _downgrade_to_hold(decision: PortfolioDecision, reason: str, warnings: list[str]) -> None:
    original = getattr(decision, "llm_decision", None) or _decision_text(decision)
    _set_decision(decision, "Hold")
    decision.decision_adjusted = original != "Hold"
    decision.decision_adjusted_reason = reason if decision.decision_adjusted else None
    _append_warning(warnings, "DECISION_DOWNGRADED_TO_HOLD")
    _append_warning(warnings, "TRADE_PLAN_INVALID")
    _clear_trade_levels(decision, warnings)


def _normalize_long(decision: PortfolioDecision, current_price: float, ticker: str | None, warnings: list[str]) -> bool:
    entry = getattr(decision, "entry_price", None) or current_price
    entry = _round_price(float(entry), ticker, warnings)
    if entry is None:
        return False

    stop = getattr(decision, "stop_loss", None)
    if stop is None or float(stop) >= float(entry):
        stop = float(entry) * 0.95
        _append_warning(warnings, "STOP_LOSS_RECOMPUTED")
    stop = _round_price(float(stop), ticker, warnings)
    if stop is None or float(stop) >= float(entry):
        return False

    risk = float(entry) - float(stop)
    target_rr, rr_warning = clamp_rr(getattr(decision, "risk_reward_ratio", None))
    _append_warning(warnings, rr_warning)
    take_profit = float(entry) + risk * target_rr
    take_profit = _round_price(take_profit, ticker, warnings)
    if take_profit is None or float(take_profit) <= float(entry):
        return False
    _append_warning(warnings, "TAKE_PROFIT_RECOMPUTED")

    reward = float(take_profit) - float(entry)
    rr = reward / risk if risk > 0 else 0.0
    if rr < MIN_RR - 0.05 or rr > MAX_RR + 0.05:
        return False

    price_target = getattr(decision, "price_target", None)
    if price_target is None or float(price_target) <= float(entry):
        price_target = take_profit
        _append_warning(warnings, "PRICE_TARGET_RECOMPUTED")
    else:
        price_target = _round_price(float(price_target), ticker, warnings)

    decision.entry_price = entry
    decision.stop_loss = stop
    decision.take_profit = take_profit
    decision.price_target = price_target
    decision.risk_per_share = round(risk, 4)
    decision.reward_per_share = round(reward, 4)
    decision.risk_reward_ratio = round(rr, 2)
    decision.risk_reward_display = f"1:{int(round(rr))}"
    return True


def _normalize_short(decision: PortfolioDecision, current_price: float, ticker: str | None, warnings: list[str]) -> bool:
    entry = getattr(decision, "entry_price", None) or current_price
    entry = _round_price(float(entry), ticker, warnings)
    if entry is None:
        return False

    stop = getattr(decision, "stop_loss", None)
    if stop is None or float(stop) <= float(entry):
        stop = float(entry) * 1.05
        _append_warning(warnings, "STOP_LOSS_RECOMPUTED")
    stop = _round_price(float(stop), ticker, warnings)
    if stop is None or float(stop) <= float(entry):
        return False

    risk = float(stop) - float(entry)
    target_rr, rr_warning = clamp_rr(getattr(decision, "risk_reward_ratio", None))
    _append_warning(warnings, rr_warning)
    take_profit = float(entry) - risk * target_rr
    take_profit = _round_price(take_profit, ticker, warnings)
    if take_profit is None or float(take_profit) >= float(entry):
        return False
    _append_warning(warnings, "TAKE_PROFIT_RECOMPUTED")

    reward = float(entry) - float(take_profit)
    rr = reward / risk if risk > 0 else 0.0
    if rr < MIN_RR - 0.05 or rr > MAX_RR + 0.05:
        return False

    price_target = getattr(decision, "price_target", None)
    if price_target is None or float(price_target) >= float(entry):
        price_target = take_profit
        _append_warning(warnings, "PRICE_TARGET_RECOMPUTED")
    else:
        price_target = _round_price(float(price_target), ticker, warnings)

    decision.entry_price = entry
    decision.stop_loss = stop
    decision.take_profit = take_profit
    decision.price_target = price_target
    decision.risk_per_share = round(risk, 4)
    decision.reward_per_share = round(reward, 4)
    decision.risk_reward_ratio = round(rr, 2)
    decision.risk_reward_display = f"1:{int(round(rr))}"
    return True


def _merge_data_quality(
    base: dict[str, Any] | None,
    *,
    price_ok: bool,
    trade_levels: str,
    llm_output: str,
    volatility_data: str,
) -> dict[str, str]:
    merged: dict[str, str] = {}
    for key, value in (base or {}).items():
        if isinstance(value, str):
            merged[key] = value
    merged.update(
        {
            "price_data": "ok" if price_ok else "missing",
            "trade_levels": trade_levels,
            "llm_output": llm_output,
            "volatility_data": volatility_data,
        }
    )
    return merged


def normalize_trade_levels(
    decision: PortfolioDecision,
    current_price: float | None,
    *,
    ticker: str | None = None,
    current_price_as_of: str | None = None,
    current_price_source: str | None = None,
    has_existing_position: bool = False,
    position_quantity: float | None = None,
    average_entry_price: float | None = None,
    price_data: str | None = None,
    data_quality: dict[str, Any] | None = None,
) -> PortfolioDecision:
    warnings = list(getattr(decision, "validation_warnings", None) or [])
    raw_llm_current_price = getattr(decision, "current_price", None)
    llm_decision = getattr(decision, "llm_decision", None) or _decision_text(decision)
    original_rebalancing = getattr(decision, "rebalancing_action", None)
    raw_volatility = _enum_value(getattr(decision, "volatility_level", None))

    if raw_llm_current_price is not None and current_price is not None:
        try:
            if abs(float(raw_llm_current_price) - float(current_price)) > 1e-6:
                _append_warning(warnings, "LLM_CURRENT_PRICE_IGNORED")
        except (TypeError, ValueError):
            _append_warning(warnings, "LLM_CURRENT_PRICE_IGNORED")
    elif raw_llm_current_price is not None and current_price is None:
        _append_warning(warnings, "LLM_CURRENT_PRICE_IGNORED")

    score = calculate_volatility_score(price_data)
    volatility_quality = "ok" if score is not None else "fallback"
    if score is None:
        try:
            score = float(getattr(decision, "volatility_score", None))
        except (TypeError, ValueError):
            score = None
    normalized_volatility = normalize_volatility_level(score, raw_volatility)
    if raw_volatility not in VOLATILITY_LEVELS:
        _append_warning(warnings, "INVALID_VOLATILITY_FIXED")

    decision.llm_decision = llm_decision
    decision.current_price = float(current_price) if current_price is not None else None
    decision.current_price_as_of = current_price_as_of
    decision.current_price_source = current_price_source if current_price is not None else None
    decision.has_existing_position = bool(has_existing_position)
    decision.position_quantity = position_quantity
    decision.average_entry_price = average_entry_price
    decision.volatility_level = normalized_volatility
    decision.volatility_score = round(score, 2) if score is not None else None

    current_price_ok = current_price is not None and float(current_price) > 0
    final_decision = llm_decision if llm_decision in REBALANCING_BY_DECISION_AND_VOLATILITY else DEFAULT_DECISION
    _set_decision(decision, final_decision)

    if not current_price_ok:
        _append_warning(warnings, "CURRENT_PRICE_MISSING")
        if final_decision in ACTIONABLE_DECISIONS:
            _downgrade_to_hold(decision, "Missing current price", warnings)
        else:
            _clear_trade_levels(decision, warnings, add_hold_warning=True)
        decision.position_size_hint = "No new position suggested."
        decision.rebalancing_action = normalize_rebalancing_action("Hold", normalized_volatility, None, bool(has_existing_position))
        decision.data_quality = _merge_data_quality(
            data_quality or getattr(decision, "data_quality", None),
            price_ok=False,
            trade_levels="invalid",
            llm_output="downgraded" if llm_decision in ACTIONABLE_DECISIONS else "ok",
            volatility_data=volatility_quality,
        )
        decision.validation_warnings = list(dict.fromkeys(warnings))
        return decision

    normalized_action = normalize_rebalancing_action(
        final_decision,
        normalized_volatility,
        original_rebalancing,
        bool(has_existing_position),
    )
    if normalized_action != original_rebalancing:
        _append_warning(warnings, "INVALID_REBALANCING_FIXED")
    decision.rebalancing_action = normalized_action

    if final_decision in LONG_DECISIONS:
        valid = _normalize_long(decision, float(current_price), ticker, warnings)
    elif final_decision in SHORT_DECISIONS:
        valid = _normalize_short(decision, float(current_price), ticker, warnings)
    else:
        valid = False

    if final_decision in ACTIONABLE_DECISIONS and valid:
        _ensure_drawdown(decision, normalized_volatility, warnings)
        decision.trade_plan_valid = True
        trade_quality = "recomputed" if warnings else "ok"
        llm_output_quality = "repaired" if warnings else "ok"
        decision.position_size_hint = POSITION_SIZE_HINTS[normalized_volatility]
    elif final_decision in ACTIONABLE_DECISIONS:
        _downgrade_to_hold(decision, "Invalid or incomplete trade plan", warnings)
        decision.rebalancing_action = normalize_rebalancing_action("Hold", normalized_volatility, None, bool(has_existing_position))
        decision.position_size_hint = "No new position suggested."
        trade_quality = "invalid"
        llm_output_quality = "downgraded"
    else:
        _clear_trade_levels(decision, warnings, add_hold_warning=True)
        decision.trade_plan_valid = False
        decision.position_size_hint = "No new position suggested."
        trade_quality = "invalid"
        llm_output_quality = "ok" if not warnings else "repaired"

    final_decision = decision.final_decision or final_decision

    if final_decision in SHORT_DECISIONS and not has_existing_position:
        decision.position_action = None
        decision.new_entry_action = decision.rebalancing_action
    elif has_existing_position:
        decision.position_action = decision.rebalancing_action
        decision.new_entry_action = "Wait for better entry" if final_decision in ACTIONABLE_DECISIONS else "No new entry"
    else:
        decision.position_action = None
        decision.new_entry_action = decision.rebalancing_action

    if getattr(decision, "decision_adjusted", False):
        llm_output_quality = "downgraded"
    decision.data_quality = _merge_data_quality(
        data_quality or getattr(decision, "data_quality", None),
        price_ok=True,
        trade_levels=trade_quality,
        llm_output=llm_output_quality,
        volatility_data=volatility_quality,
    )
    decision.validation_warnings = list(dict.fromkeys(warnings))
    return decision
