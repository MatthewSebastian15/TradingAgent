from __future__ import annotations

from typing import Any

from tradingagents.financial_highlights.calculator import safe_divide

from .common import POLICY_MULTIPLES, data_quality, effective_ebitda, metric, metric_values, select_primary_method


def _fair_value(snapshot: dict[str, Any], method: str | None, multiple: float) -> float | None:
    if method == "P/BV":
        return snapshot.get("bvps") * multiple if snapshot.get("bvps") is not None else None
    if method == "P/E":
        return snapshot.get("eps") * multiple if snapshot.get("eps") is not None else None
    if method == "P/S":
        revenue_per_share = safe_divide(snapshot.get("revenue"), snapshot.get("shares_outstanding"))
        return revenue_per_share * multiple if revenue_per_share is not None else None
    if method == "EV/EBITDA":
        ebitda, _status, _source = effective_ebitda(snapshot)
        equity_value = (
            ebitda * multiple - snapshot["total_debt"] + snapshot["cash"]
            if ebitda is not None and snapshot.get("total_debt") is not None and snapshot.get("cash") is not None
            else None
        )
        return safe_divide(equity_value, snapshot.get("shares_outstanding"))
    return None


def build_fair_value_range(snapshot: dict[str, Any]) -> dict[str, Any]:
    currency = snapshot["currency"]
    method = select_primary_method(snapshot)
    policy = POLICY_MULTIPLES.get(method or "", {})
    current_price = snapshot.get("current_price")
    _ebitda, ebitda_status, _source = effective_ebitda(snapshot)
    estimated_method = method == "EV/EBITDA" and ebitda_status == "estimated"
    fair_values = {
        case: _fair_value(snapshot, method, policy[case]) if case in policy else None
        for case in ("bear", "base", "bull")
    }
    details = {
        "current_price": metric(
            current_price,
            currency=currency,
            format_type="price",
            formula="Last close price on or before analysis date",
            status="reported",
        ),
        **{
            case: metric(
                value,
                currency=currency,
                format_type="price",
                formula=f"{method or 'N/A'} fair value using {policy.get(case, 'N/A')}x policy multiple",
                status="estimated" if estimated_method else "calculated",
            )
            for case, value in fair_values.items()
        },
        **{
            f"{case}_upside_percent": metric(
                safe_divide(value - current_price, current_price) * 100
                if value is not None and current_price not in (None, 0)
                else None,
                currency=currency,
                format_type="percent",
                formula=f"({case.title()} Fair Value - Current Price) / Current Price * 100",
                status="estimated" if estimated_method else "calculated",
            )
            for case, value in fair_values.items()
        },
    }
    values = metric_values(details)
    return {
        "currency": currency,
        **values,
        "metric_details": details,
        "method": "multiple-based valuation" if method else "N/A",
        "primary_method": method,
        "assumptions": [
            f"Base case uses the documented {method} policy multiple." if method else "No valuation method has enough data.",
            "Bear case uses the lower documented policy multiple.",
            "Bull case uses the higher documented policy multiple.",
        ],
        "data_quality": data_quality(
            details,
            fallback_used=["EBITDA estimated from operating income"] if estimated_method else [],
        ),
    }
