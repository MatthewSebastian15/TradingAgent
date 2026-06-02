from __future__ import annotations

from typing import Any

from tradingagents.financial_highlights.calculator import safe_divide, safe_percent

from .common import data_quality, metric, metric_values


def build_quality_of_earnings(snapshot: dict[str, Any]) -> dict[str, Any]:
    currency = snapshot["currency"]
    cfo = snapshot.get("operating_cash_flow")
    net_profit = snapshot.get("net_profit")
    capex = snapshot.get("capex")
    free_cash_flow = cfo - capex if cfo is not None and capex is not None else None
    cfo_to_net_income = safe_divide(cfo, net_profit)
    details = {
        "cfo_to_net_income": metric(
            cfo_to_net_income,
            currency=currency,
            format_type="ratio",
            formula="Operating Cash Flow / Net Income",
        ),
        "free_cash_flow": metric(
            free_cash_flow,
            currency=currency,
            format_type="currency",
            formula="Operating Cash Flow - Capex",
        ),
        "capex_intensity_percent": metric(
            safe_percent(capex, snapshot.get("revenue")),
            currency=currency,
            format_type="percent",
            formula="Capex / Revenue * 100",
        ),
    }
    if cfo_to_net_income is None or free_cash_flow is None:
        rating, accrual_risk = "N/A", "N/A"
    elif cfo_to_net_income > 1 and free_cash_flow > 0:
        rating, accrual_risk = "healthy", "low"
    elif cfo_to_net_income < 0.7 or free_cash_flow < 0:
        rating, accrual_risk = "weak", "high"
    else:
        rating, accrual_risk = "watch", "moderate"
    notes = []
    if cfo_to_net_income is not None:
        notes.append("Operating cash flow is compared with net income.")
    if free_cash_flow is not None:
        notes.append("Free cash flow is calculated after capex.")
    return {
        **metric_values(details),
        "metric_details": details,
        "accrual_risk": accrual_risk,
        "rating": rating,
        "notes": notes,
        "data_quality": data_quality(details),
    }
