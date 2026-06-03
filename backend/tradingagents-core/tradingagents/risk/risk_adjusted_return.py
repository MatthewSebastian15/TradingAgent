from __future__ import annotations

import math
from typing import Any


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _metric_value(payload: dict[str, Any] | None, key: str) -> float | None:
    if not isinstance(payload, dict):
        return None
    detail = payload.get("metric_details", {}).get(key) if isinstance(payload.get("metric_details"), dict) else None
    if isinstance(detail, dict):
        value = _number(detail.get("value"))
        if value is not None:
            return value
    return _number(payload.get(key))


def _scenario_value(payload: dict[str, Any] | None, case: str) -> float | None:
    if not isinstance(payload, dict):
        return None
    scenario = payload.get(case)
    if isinstance(scenario, dict):
        value = _number(scenario.get("fair_value"))
        if value is not None:
            return value
    return None


def _first_number(*values: Any) -> float | None:
    for value in values:
        number = _number(value)
        if number is not None:
            return number
    return None


def _round(value: float | None, digits: int = 2) -> float | None:
    return round(value, digits) if value is not None else None


def build_risk_adjusted_return(result: dict[str, Any]) -> dict[str, Any]:
    current_price = _first_number(result.get("current_price"), result.get("last_close_price"))
    scenario = result.get("scenario_analysis") if isinstance(result.get("scenario_analysis"), dict) else {}
    fair_value = result.get("fair_value_range") if isinstance(result.get("fair_value_range"), dict) else {}
    target = _first_number(
        result.get("take_profit"),
        _scenario_value(scenario, "base"),
        _metric_value(fair_value, "base"),
    )
    downside_anchor = _first_number(
        result.get("stop_loss"),
        _scenario_value(scenario, "bear"),
        _metric_value(fair_value, "bear"),
    )

    upside = ((target - current_price) / current_price * 100) if current_price and target is not None else None
    downside = (
        ((downside_anchor - current_price) / current_price * 100)
        if current_price and downside_anchor is not None
        else None
    )
    ratio = None
    if upside is not None and downside not in (None, 0):
        ratio = abs(upside) / abs(downside)

    if ratio is None or upside is None or upside <= 0:
        label = "unattractive"
    elif ratio >= 1.5:
        label = "attractive"
    elif ratio >= 0.75:
        label = "balanced"
    else:
        label = "unattractive"

    notes = []
    if current_price is None:
        notes.append("Current price is unavailable, so risk-adjusted return cannot be calculated.")
    elif target is None or downside_anchor is None:
        notes.append("Target or downside anchor is unavailable, so the ratio is incomplete.")
    elif ratio is not None:
        notes.append(f"Upside is {round(ratio, 2)}x the downside anchor.")

    return {
        "upside_percent": _round(upside),
        "downside_percent": _round(downside),
        "risk_reward_ratio": f"{ratio:.1f}x" if ratio is not None else "N/A",
        "expected_return_label": label,
        "notes": notes,
    }
