from __future__ import annotations

import csv
import math
import re
from io import StringIO
from statistics import pstdev
from typing import Any

from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
from tradingagents.dataflows.providers.errors import ErrorCode

DEFAULT_TARGET_RR = 3.0


def _rr_display(target_rr: float) -> str:
    return f"1:{target_rr:g}"


DEFAULT_DECISION = "Hold"
DEFAULT_VOLATILITY_LEVEL = "Medium"

VOLATILITY_LEVELS = {"Low", "Medium", "High", "Very High"}
DECISION_ALIASES = {
    "Buy": "Buy",
    "Overweight": "Buy",
    "Hold": "Hold",
    "Sell": "Sell",
    "Underweight": "Sell",
}
ACTIONABLE_DECISIONS = {"Buy", "Sell"}
LONG_DECISIONS = {"Buy"}
SHORT_DECISIONS = {"Sell"}
NO_POSITION_REBALANCING_ACTION = "No position to rebalance"

REBALANCING_ACTIONS = {
    "Open new position",
    "Add position",
    "Maintain position",
    "Trim position",
    "Exit position",
    "Avoid new entry",
    NO_POSITION_REBALANCING_ACTION,
}
EXISTING_POSITION_ACTIONS = {"Add position", "Maintain position", "Trim position", "Exit position"}
LLM_REPAIR_WARNING_CODES = {
    "LLM_CURRENT_PRICE_IGNORED",
    "INVALID_VOLATILITY_FIXED",
    "INVALID_REBALANCING_FIXED",
    "ENTRY_PRICE_RECOMPUTED",
    "STOP_LOSS_RECOMPUTED",
    "TAKE_PROFIT_RECOMPUTED",
    "PRICE_TARGET_RECOMPUTED",
    "RR_FORCED_TO_3",
    "DECISION_DOWNGRADED_TO_HOLD",
    "TRADE_PLAN_INVALID",
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


def _canonical_decision(value: Any) -> str:
    raw = _enum_value(value)
    return DECISION_ALIASES.get(str(raw), DEFAULT_DECISION)


def _decision_text(decision: PortfolioDecision) -> str:
    raw = (
        getattr(decision, "final_decision", None)
        or getattr(decision, "decision", None)
        or _enum_value(getattr(decision, "rating", None))
        or DEFAULT_DECISION
    )
    return _canonical_decision(raw)


def _append_warning(warnings: list[str], warning: str | None) -> None:
    if warning and warning not in warnings:
        warnings.append(warning)


def _blocking_quality_reason(data_quality: dict[str, Any] | None) -> str | None:
    if not isinstance(data_quality, dict):
        return None
    field_quality = data_quality.get("field_quality")
    if not isinstance(field_quality, dict):
        return None
    for field_name, quality in field_quality.items():
        if not isinstance(quality, dict) or not quality.get("blocking"):
            continue
        status = str(quality.get("status") or "").lower()
        confidence = str(quality.get("confidence") or "").lower()
        if (
            status in {"source_unavailable", "unavailable", "empty", "failed"}
            or confidence == "unavailable"
        ):
            return f"Blocking data quality field unavailable: {field_name}"
    return None


def _apply_target_rr(decision: PortfolioDecision, target_rr: float, warnings: list[str]) -> None:
    """Force the decision's Risk:Reward to the target, warning if the LLM value differed."""
    try:
        raw = float(getattr(decision, "risk_reward_ratio", None))
    except (TypeError, ValueError):
        raw = None
    if raw is None or abs(raw - target_rr) > 1e-6:
        _append_warning(warnings, "RR_FORCED_TO_3")
    decision.risk_reward_ratio = target_rr
    decision.risk_reward_display = _rr_display(target_rr)


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


def _round_price(
    price: float | None, ticker: str | None, warnings: list[str]
) -> float | int | None:
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
    lines = [
        line
        for line in (price_data or "").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
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
    if len(returns) < 2:
        return None

    annual_volatility = pstdev(returns) * math.sqrt(252)
    if not math.isfinite(annual_volatility):
        return None

    score = min(max(annual_volatility * 100, 0.0), 100.0)
    return round(score, 2)


def calculate_atr(price_data: str | None, window_size: int = 14) -> float | None:
    """Return a simple ATR estimate from the collected OHLCV CSV."""
    rows = _parse_price_rows(price_data)
    if len(rows) < 2:
        return None
    true_ranges: list[float] = []
    previous_close = rows[0]["close"]
    for item in rows[1:]:
        high = item.get("high") or 0.0
        low = item.get("low") or 0.0
        close = item["close"]
        if high <= 0 or low <= 0 or high < low or previous_close <= 0:
            previous_close = close
            continue
        true_ranges.append(max(high - low, abs(high - previous_close), abs(low - previous_close)))
        previous_close = close
    if not true_ranges:
        return None
    window = true_ranges[-window_size:]
    atr = sum(window) / len(window)
    return atr if math.isfinite(atr) and atr > 0 else None


def calculate_risk_distance(
    current_price: float, volatility_level: str, price_data: str | None
) -> float:
    """Calculate deterministic risk distance for the fixed 1:3 trade contract."""
    fallback_pct = {
        "Low": 0.03,
        "Medium": 0.04,
        "High": 0.05,
        "Very High": 0.07,
    }.get(volatility_level, 0.04)
    fallback_risk = current_price * fallback_pct
    atr = calculate_atr(price_data)
    risk = atr if atr is not None else fallback_risk
    min_risk = current_price * 0.01
    max_risk = current_price * 0.15
    return max(min_risk, min(float(risk), max_risk))


def _values_differ(left: Any, right: Any, tolerance: float = 1e-6) -> bool:
    try:
        return abs(float(left) - float(right)) > tolerance
    except (TypeError, ValueError):
        return left is not None


def _has_llm_repair_warning(warnings: list[str]) -> bool:
    return any(code in LLM_REPAIR_WARNING_CODES for code in warnings)


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
    has_existing_position: bool,
    trade_plan_actionable: bool,
    confidence: float | None,
) -> str:
    """Return the only rebalancing action allowed by the backend matrix."""
    normalized_decision = _canonical_decision(decision)
    try:
        confidence_value = float(confidence) if confidence is not None else 0.0
    except (TypeError, ValueError):
        confidence_value = 0.0

    if not has_existing_position:
        if normalized_decision == "Buy" and trade_plan_actionable:
            return "Open new position"
        return NO_POSITION_REBALANCING_ACTION

    if normalized_decision == "Buy":
        if trade_plan_actionable and confidence_value >= 0.65:
            return "Add position"
        return "Maintain position"

    if normalized_decision == "Hold":
        return "Maintain position"

    if normalized_decision == "Sell":
        if confidence_value >= 0.65:
            return "Exit position"
        return "Trim position"

    return "Maintain position"


def resolve_existing_position(
    has_existing_position: bool | None,
    position_quantity: float | None,
) -> bool:
    """Resolve final existing-position status from request flag and quantity."""
    if position_quantity is not None:
        try:
            quantity = float(position_quantity)
        except (TypeError, ValueError):
            return bool(has_existing_position)

        if quantity > 0:
            return True
        if quantity == 0:
            return False

        return bool(has_existing_position)

    return bool(has_existing_position)


def _append_position_resolution_warnings(
    warnings: list[str],
    *,
    has_existing_position: bool | None,
    position_quantity: float | None,
    resolved_has_existing_position: bool,
) -> None:
    if position_quantity is None:
        return
    try:
        quantity = float(position_quantity)
    except (TypeError, ValueError):
        _append_warning(warnings, "POSITION_QUANTITY_INVALID")
        if resolved_has_existing_position != bool(has_existing_position):
            _append_warning(warnings, "POSITION_FLAG_CONFLICT_FIXED")
        return

    if quantity < 0:
        _append_warning(warnings, "POSITION_QUANTITY_INVALID")
        return

    if resolved_has_existing_position != bool(has_existing_position):
        _append_warning(warnings, "POSITION_FLAG_CONFLICT_FIXED")


def build_position_action(
    has_existing_position: bool,
    rebalancing_action: str | None,
) -> str | None:
    """Return position action only when the user already owns the position."""
    if not has_existing_position:
        return None

    if rebalancing_action in EXISTING_POSITION_ACTIONS:
        return rebalancing_action

    return "Maintain position"


def build_new_entry_action(
    *,
    has_existing_position: bool,
    final_decision: str | None,
    rebalancing_action: str | None,
    trade_plan_valid: bool,
    current_price_ok: bool,
) -> str:
    """Return user-facing new-entry instruction synced with existing position."""
    if not current_price_ok:
        if has_existing_position:
            return "No new entry until price data is valid"
        return "Wait until valid price data is available"

    normalized_decision = _canonical_decision(final_decision)

    if has_existing_position:
        if rebalancing_action == "Add position":
            return "No separate new entry; add only to existing position"
        if rebalancing_action == "Maintain position":
            return "No new entry; maintain existing position"
        if rebalancing_action == "Trim position":
            return "Do not add; reduce existing exposure"
        if rebalancing_action == "Exit position":
            return "No new entry; exit existing position"
        return "No new entry; maintain existing position"

    if normalized_decision == "Buy" and trade_plan_valid:
        return "Allowed with validated entry"
    if normalized_decision == "Buy":
        return "Wait for valid entry setup"
    if normalized_decision == "Sell":
        return "Avoid entry; wait for risk to normalize"
    return "Wait for valid entry setup"


def build_position_size_hint(
    *,
    has_existing_position: bool,
    final_decision: str | None,
    rebalancing_action: str | None,
    volatility_level: str,
    trade_plan_valid: bool,
    current_price_ok: bool,
) -> str:
    """Return position-size guidance that matches user position context."""
    if not current_price_ok:
        if has_existing_position:
            return "Maintain current position size until valid price data is available."
        return "0% allocation until valid price data is available."

    normalized_decision = _canonical_decision(final_decision)

    if has_existing_position:
        if rebalancing_action == "Add position":
            return {
                "Low": "Add to existing position gradually; normal add size may be acceptable.",
                "Medium": "Add gradually using standard risk limits.",
                "High": "Add only small size due to high volatility.",
                ("Very High"): (
                    "Avoid aggressive add; use very small add only if conviction remains strong."
                ),
            }.get(volatility_level, "Add gradually using standard risk limits.")

        if rebalancing_action == "Maintain position":
            return "Maintain current position size; no additional exposure suggested."

        if rebalancing_action == "Trim position":
            return {
                "Low": "Reduce position size gradually; no new exposure suggested.",
                "Medium": "Reduce position size gradually; no new exposure suggested.",
                "High": "Reduce exposure due to elevated volatility; no new add suggested.",
                "Very High": "Reduce exposure aggressively or prepare full exit if risk worsens.",
            }.get(volatility_level, "Reduce position size gradually; no new exposure suggested.")

        if rebalancing_action == "Exit position":
            return "Exit existing position; no new exposure suggested."

        return "Maintain current position size; no additional exposure suggested."

    if normalized_decision == "Buy" and trade_plan_valid:
        return {
            "Low": "New entry may use normal starter size if the trade plan is valid.",
            "Medium": "Use standard starter size and avoid oversized entry.",
            "High": "Use smaller starter size due to high volatility.",
            ("Very High"): (
                "Use very small starter size only, or avoid entry if risk is not acceptable."
            ),
        }.get(volatility_level, "Use standard starter size and avoid oversized entry.")

    if normalized_decision == "Buy":
        return "0% allocation until the trade plan is valid."
    if normalized_decision == "Sell":
        return "0% allocation; stay on watchlist only until risk normalizes."
    return "0% allocation until setup improves."


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


def _ensure_drawdown(
    decision: PortfolioDecision, volatility_level: str, warnings: list[str]
) -> None:
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


def _clear_trade_levels(
    decision: PortfolioDecision, warnings: list[str], *, add_hold_warning: bool = False
) -> None:
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
    if add_hold_warning:
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


def _normalize_long(
    decision: PortfolioDecision,
    current_price: float,
    ticker: str | None,
    warnings: list[str],
    price_data: str | None,
    volatility_level: str,
    target_rr: float,
) -> bool:
    entry = _round_price(float(current_price), ticker, warnings)
    if entry is None:
        return False
    if _values_differ(getattr(decision, "entry_price", None), entry):
        _append_warning(warnings, "ENTRY_PRICE_RECOMPUTED")

    risk_distance = calculate_risk_distance(float(entry), volatility_level, price_data)
    stop = _round_price(float(entry) - risk_distance, ticker, warnings)
    if stop is None or float(stop) >= float(entry):
        tick = (
            get_idx_tick_size(float(entry))
            if _is_indonesia_ticker(ticker)
            else max(float(entry) * 0.01, 0.01)
        )
        stop = _round_price(float(entry) - tick, ticker, warnings)
    if stop is None or float(stop) >= float(entry):
        return False
    if _values_differ(getattr(decision, "stop_loss", None), stop):
        _append_warning(warnings, "STOP_LOSS_RECOMPUTED")

    risk = float(entry) - float(stop)
    if risk <= 0:
        return False

    take_profit = _round_price(float(entry) + risk * target_rr, ticker, warnings)
    if take_profit is None or float(take_profit) <= float(entry):
        return False
    if _values_differ(getattr(decision, "take_profit", None), take_profit):
        _append_warning(warnings, "TAKE_PROFIT_RECOMPUTED")

    reward = float(take_profit) - float(entry)
    if reward <= 0:
        return False

    price_target = getattr(decision, "price_target", None)
    if price_target is None or float(price_target) <= float(entry):
        price_target = take_profit
        _append_warning(warnings, "PRICE_TARGET_RECOMPUTED")
    else:
        price_target = _round_price(float(price_target), ticker, warnings)
        if price_target is None or float(price_target) <= float(entry):
            price_target = take_profit
            _append_warning(warnings, "PRICE_TARGET_RECOMPUTED")

    decision.entry_price = entry
    decision.stop_loss = stop
    decision.take_profit = take_profit
    decision.price_target = price_target
    decision.risk_per_share = round(risk, 4)
    decision.reward_per_share = round(reward, 4)
    _apply_target_rr(decision, target_rr, warnings)
    return True


def _normalize_short(
    decision: PortfolioDecision,
    current_price: float,
    ticker: str | None,
    warnings: list[str],
    price_data: str | None,
    volatility_level: str,
    target_rr: float,
) -> bool:
    entry = _round_price(float(current_price), ticker, warnings)
    if entry is None:
        return False
    if _values_differ(getattr(decision, "entry_price", None), entry):
        _append_warning(warnings, "ENTRY_PRICE_RECOMPUTED")

    risk_distance = calculate_risk_distance(float(entry), volatility_level, price_data)
    stop = _round_price(float(entry) + risk_distance, ticker, warnings)
    if stop is None or float(stop) <= float(entry):
        tick = (
            get_idx_tick_size(float(entry))
            if _is_indonesia_ticker(ticker)
            else max(float(entry) * 0.01, 0.01)
        )
        stop = _round_price(float(entry) + tick, ticker, warnings)
    if stop is None or float(stop) <= float(entry):
        return False
    if _values_differ(getattr(decision, "stop_loss", None), stop):
        _append_warning(warnings, "STOP_LOSS_RECOMPUTED")

    risk = float(stop) - float(entry)
    if risk <= 0:
        return False

    take_profit = _round_price(float(entry) - risk * target_rr, ticker, warnings)
    if take_profit is None or float(take_profit) >= float(entry) or float(take_profit) <= 0:
        return False
    if _values_differ(getattr(decision, "take_profit", None), take_profit):
        _append_warning(warnings, "TAKE_PROFIT_RECOMPUTED")

    reward = float(entry) - float(take_profit)
    if reward <= 0:
        return False

    price_target = getattr(decision, "price_target", None)
    if price_target is None or float(price_target) >= float(entry):
        price_target = take_profit
        _append_warning(warnings, "PRICE_TARGET_RECOMPUTED")
    else:
        price_target = _round_price(float(price_target), ticker, warnings)
        if price_target is None or float(price_target) >= float(entry):
            price_target = take_profit
            _append_warning(warnings, "PRICE_TARGET_RECOMPUTED")

    decision.entry_price = entry
    decision.stop_loss = stop
    decision.take_profit = take_profit
    decision.price_target = price_target
    decision.risk_per_share = round(risk, 4)
    decision.reward_per_share = round(reward, 4)
    _apply_target_rr(decision, target_rr, warnings)
    return True


def _merge_data_quality(
    base: dict[str, Any] | None,
    *,
    price_ok: bool,
    trade_levels: str,
    llm_output: str,
    volatility_data: str,
) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for key, value in (base or {}).items():
        if isinstance(value, (str, list, dict, bool, int, float)) or value is None:
            merged[key] = value

    if price_ok:
        existing_price_status = merged.get("price_data")
        if existing_price_status in {None, "", "missing", "invalid_ticker"}:
            merged["price_data"] = "ok"
    else:
        merged["price_data"] = "missing"

    merged.update(
        {
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
    target_risk_reward: float = DEFAULT_TARGET_RR,
) -> PortfolioDecision:
    warnings = list(getattr(decision, "validation_warnings", None) or [])
    try:
        target_rr = float(target_risk_reward)
    except (TypeError, ValueError):
        target_rr = DEFAULT_TARGET_RR
    if target_rr <= 0:
        target_rr = DEFAULT_TARGET_RR
    raw_llm_current_price = getattr(decision, "current_price", None)
    raw_llm_decision = (
        getattr(decision, "llm_decision", None)
        or _enum_value(getattr(decision, "rating", None))
        or _decision_text(decision)
    )
    llm_decision = str(_enum_value(raw_llm_decision) or DEFAULT_DECISION)
    original_rebalancing = _enum_value(getattr(decision, "rebalancing_action", None))
    raw_volatility = _enum_value(getattr(decision, "volatility_level", None))
    resolved_has_existing_position = resolve_existing_position(
        has_existing_position, position_quantity
    )
    _append_position_resolution_warnings(
        warnings,
        has_existing_position=has_existing_position,
        position_quantity=position_quantity,
        resolved_has_existing_position=resolved_has_existing_position,
    )

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
    decision.has_existing_position = resolved_has_existing_position
    decision.position_quantity = position_quantity
    decision.average_entry_price = average_entry_price
    decision.volatility_level = normalized_volatility
    decision.volatility_score = round(score, 2) if score is not None else None

    current_price_ok = current_price is not None and float(current_price) > 0
    final_decision = _canonical_decision(llm_decision)
    action_decision_context = final_decision
    _set_decision(decision, final_decision)

    if not current_price_ok:
        _append_warning(warnings, "CURRENT_PRICE_MISSING")
        if final_decision in ACTIONABLE_DECISIONS:
            _downgrade_to_hold(decision, "Missing current price", warnings)
        else:
            _clear_trade_levels(decision, warnings, add_hold_warning=True)
        decision.rebalancing_action = normalize_rebalancing_action(
            "Hold",
            resolved_has_existing_position,
            False,
            getattr(decision, "confidence_score", None),
        )
        decision.position_action = build_position_action(
            resolved_has_existing_position,
            decision.rebalancing_action,
        )
        decision.new_entry_action = build_new_entry_action(
            has_existing_position=resolved_has_existing_position,
            final_decision="Hold",
            rebalancing_action=decision.rebalancing_action,
            trade_plan_valid=False,
            current_price_ok=False,
        )
        decision.position_size_hint = build_position_size_hint(
            has_existing_position=resolved_has_existing_position,
            final_decision="Hold",
            rebalancing_action=decision.rebalancing_action,
            volatility_level=normalized_volatility,
            trade_plan_valid=False,
            current_price_ok=False,
        )
        decision.data_quality = _merge_data_quality(
            data_quality or getattr(decision, "data_quality", None),
            price_ok=False,
            trade_levels="invalid",
            llm_output="downgraded" if llm_decision in ACTIONABLE_DECISIONS else "ok",
            volatility_data=volatility_quality,
        )
        decision.validation_warnings = list(dict.fromkeys(warnings))
        return decision

    blocking_reason = _blocking_quality_reason(data_quality)
    if blocking_reason and final_decision in ACTIONABLE_DECISIONS:
        _append_warning(warnings, ErrorCode.DATA_QUALITY_BLOCKING)
        _downgrade_to_hold(decision, blocking_reason, warnings)
        decision.rebalancing_action = normalize_rebalancing_action(
            "Hold",
            resolved_has_existing_position,
            False,
            getattr(decision, "confidence_score", None),
        )
        decision.position_action = build_position_action(
            resolved_has_existing_position,
            decision.rebalancing_action,
        )
        decision.new_entry_action = build_new_entry_action(
            has_existing_position=resolved_has_existing_position,
            final_decision="Hold",
            rebalancing_action=decision.rebalancing_action,
            trade_plan_valid=False,
            current_price_ok=True,
        )
        decision.position_size_hint = build_position_size_hint(
            has_existing_position=resolved_has_existing_position,
            final_decision="Hold",
            rebalancing_action=decision.rebalancing_action,
            volatility_level=normalized_volatility,
            trade_plan_valid=False,
            current_price_ok=True,
        )
        decision.data_quality = _merge_data_quality(
            data_quality or getattr(decision, "data_quality", None),
            price_ok=True,
            trade_levels="invalid",
            llm_output="downgraded",
            volatility_data=volatility_quality,
        )
        decision.validation_warnings = list(dict.fromkeys(warnings))
        return decision

    if final_decision in LONG_DECISIONS:
        valid = _normalize_long(
            decision,
            float(current_price),
            ticker,
            warnings,
            price_data,
            normalized_volatility,
            target_rr,
        )
    elif final_decision in SHORT_DECISIONS:
        valid = _normalize_short(
            decision,
            float(current_price),
            ticker,
            warnings,
            price_data,
            normalized_volatility,
            target_rr,
        )
    else:
        valid = False

    normalized_action = normalize_rebalancing_action(
        final_decision,
        resolved_has_existing_position,
        final_decision in ACTIONABLE_DECISIONS and valid,
        getattr(decision, "confidence_score", None),
    )
    if original_rebalancing is not None and normalized_action != original_rebalancing:
        _append_warning(warnings, "INVALID_REBALANCING_FIXED")
    decision.rebalancing_action = normalized_action

    if final_decision in ACTIONABLE_DECISIONS and valid:
        _ensure_drawdown(decision, normalized_volatility, warnings)
        decision.trade_plan_valid = True
        trade_quality = "recomputed"
        llm_output_quality = "repaired" if _has_llm_repair_warning(warnings) else "ok"
    elif final_decision in ACTIONABLE_DECISIONS:
        _downgrade_to_hold(decision, "Invalid or incomplete trade plan", warnings)
        decision.rebalancing_action = normalize_rebalancing_action(
            "Hold",
            resolved_has_existing_position,
            False,
            getattr(decision, "confidence_score", None),
        )
        trade_quality = "invalid"
        llm_output_quality = "downgraded"
    else:
        _clear_trade_levels(decision, warnings, add_hold_warning=True)
        decision.trade_plan_valid = False
        trade_quality = "hidden"
        llm_output_quality = "repaired" if _has_llm_repair_warning(warnings) else "ok"

    final_decision = decision.final_decision or final_decision
    trade_plan_valid = bool(getattr(decision, "trade_plan_valid", False))
    decision.position_action = build_position_action(
        resolved_has_existing_position,
        decision.rebalancing_action,
    )
    decision.new_entry_action = build_new_entry_action(
        has_existing_position=resolved_has_existing_position,
        final_decision=action_decision_context,
        rebalancing_action=decision.rebalancing_action,
        trade_plan_valid=trade_plan_valid,
        current_price_ok=True,
    )
    decision.position_size_hint = build_position_size_hint(
        has_existing_position=resolved_has_existing_position,
        final_decision=action_decision_context,
        rebalancing_action=decision.rebalancing_action,
        volatility_level=normalized_volatility,
        trade_plan_valid=trade_plan_valid,
        current_price_ok=True,
    )

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
