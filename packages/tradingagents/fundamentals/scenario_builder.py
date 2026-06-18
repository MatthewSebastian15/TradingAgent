from __future__ import annotations

from typing import Any

from .common import POLICY_MULTIPLES, metric


def _last_number(values: list[Any] | None) -> float | None:
    for value in reversed(values or []):
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _display_metric(detail: dict[str, Any] | None) -> str:
    payload = detail or {}
    display = payload.get("display", "N/A")
    return (
        f"{display} EST" if payload.get("status") == "estimated" and display != "N/A" else display
    )


def build_scenario_analysis(
    snapshot: dict[str, Any],
    financial_trends: dict[str, Any],
    fair_value_range: dict[str, Any],
) -> dict[str, Any]:
    method = fair_value_range.get("primary_method")
    policy = POLICY_MULTIPLES.get(method or "", {})
    metrics = financial_trends.get("metrics") or {}
    base_growth = _last_number(metrics.get("revenue_growth_percent"))
    base_margin = _last_number(metrics.get("net_profit_margin_percent"))
    adjustments = {
        "bear": (-3.0, -2.0, "Lower growth, margin pressure, and multiple compression"),
        "base": (0.0, 0.0, "Current growth and margin profile with the base policy multiple"),
        "bull": (3.0, 2.0, "Higher growth, margin expansion, and multiple expansion"),
    }
    scenarios = {}
    metric_details = {}
    for case, (growth_delta, margin_delta, assumption) in adjustments.items():
        growth_assumption = base_growth + growth_delta if base_growth is not None else None
        margin_assumption = base_margin + margin_delta if base_margin is not None else None
        case_details = {
            "fair_value": dict(fair_value_range.get("metric_details", {}).get(case, {})),
            "upside_downside_percent": dict(
                fair_value_range.get("metric_details", {}).get(f"{case}_upside_percent", {})
            ),
            "revenue_growth_assumption_percent": metric(
                growth_assumption,
                currency=snapshot["currency"],
                format_type="percent",
                formula=f"Latest revenue growth {growth_delta:+g} percentage points",
            ),
            "margin_assumption_percent": metric(
                margin_assumption,
                currency=snapshot["currency"],
                format_type="percent",
                formula=f"Latest net profit margin {margin_delta:+g} percentage points",
            ),
        }
        metric_details[case] = case_details
        scenarios[case] = {
            "fair_value": fair_value_range.get(case),
            "fair_value_display": _display_metric(
                fair_value_range.get("metric_details", {}).get(case)
            ),
            "upside_downside_percent": fair_value_range.get(f"{case}_upside_percent"),
            "upside_downside_display": _display_metric(
                fair_value_range.get("metric_details", {}).get(f"{case}_upside_percent")
            ),
            "revenue_growth_assumption_percent": growth_assumption,
            "margin_assumption_percent": margin_assumption,
            "valuation_multiple": f"{policy.get(case)}x {method}"
            if method and case in policy
            else "N/A",
            "assumption": assumption,
            "metric_details": case_details,
        }
    quality = dict(fair_value_range.get("data_quality", {}))
    missing_fields = list(quality.get("missing_fields") or [])
    missing_fields.extend(
        f"{case}.{key}"
        for case, details in metric_details.items()
        for key, item in details.items()
        if not item or item.get("status") == "unavailable"
    )
    quality["missing_fields"] = list(dict.fromkeys(missing_fields))
    quality["fallback_used"] = list(quality.get("fallback_used") or [])
    quality["warnings"] = list(quality.get("warnings") or [])
    if quality["missing_fields"] and quality.get("status") == "complete":
        quality["status"] = "partial"
    return {
        "currency": snapshot["currency"],
        **scenarios,
        "metric_details": metric_details,
        "data_quality": quality,
    }
