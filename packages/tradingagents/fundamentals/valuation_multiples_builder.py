from __future__ import annotations

from typing import Any

from tradingagents.financial_highlights.calculator import safe_divide

from .common import (
    POLICY_MULTIPLES,
    data_quality,
    effective_ebitda,
    metric,
    metric_values,
    select_primary_method,
)


def build_valuation_multiples(snapshot: dict[str, Any]) -> dict[str, Any]:
    currency = snapshot["currency"]
    market_cap = snapshot.get("market_cap")
    debt = snapshot.get("total_debt")
    cash = snapshot.get("cash")
    ebitda, ebitda_status, _ebitda_source = effective_ebitda(snapshot)
    enterprise_value = market_cap + debt - cash if None not in (market_cap, debt, cash) else None
    fallbacks = []
    if snapshot.get("market_cap_status") == "estimated":
        fallbacks.append("Market cap uses company profile fallback")
    if ebitda_status == "estimated":
        fallbacks.append("EBITDA estimated from operating income")
    details = {
        "market_cap": metric(
            market_cap,
            currency=currency,
            format_type="currency",
            formula=str(snapshot.get("market_cap_formula")),
            status=str(snapshot.get("market_cap_status")),
        ),
        "enterprise_value": metric(
            enterprise_value,
            currency=currency,
            format_type="currency",
            formula="Market Cap + Total Debt - Cash",
        ),
        "pe": metric(
            safe_divide(market_cap, snapshot.get("net_profit")),
            currency=currency,
            format_type="ratio",
            formula="Market Cap / Net Profit",
        ),
        "pbv": metric(
            safe_divide(market_cap, snapshot.get("total_equity")),
            currency=currency,
            format_type="ratio",
            formula="Market Cap / Total Equity",
        ),
        "ps": metric(
            safe_divide(market_cap, snapshot.get("revenue")),
            currency=currency,
            format_type="ratio",
            formula="Market Cap / Revenue",
        ),
        "ev_ebitda": metric(
            safe_divide(enterprise_value, ebitda),
            currency=currency,
            format_type="ratio",
            formula="Enterprise Value / EBITDA",
            status="estimated"
            if ebitda_status == "estimated" and enterprise_value is not None
            else "calculated",
        ),
    }
    values = metric_values(details)
    primary_method = select_primary_method(snapshot)
    method_field = {"P/BV": "pbv", "EV/EBITDA": "ev_ebitda", "P/E": "pe", "P/S": "ps"}.get(
        primary_method
    )
    selected_value = values.get(method_field) if method_field else None
    base_target = POLICY_MULTIPLES.get(primary_method or "", {}).get("base")
    label = "N/A"
    if selected_value is not None and base_target:
        label = (
            "cheap"
            if selected_value <= base_target * 0.85
            else "expensive"
            if selected_value >= base_target * 1.15
            else "fair"
        )
    return {
        "currency": currency,
        **values,
        "metric_details": details,
        "interpretation": {
            "valuation_label": label,
            "primary_method": primary_method,
            "main_reason": (
                f"{primary_method} is compared with the documented base policy multiple."
                if primary_method
                else "No valuation method has enough data."
            ),
        },
        "data_quality": data_quality(details, fallback_used=fallbacks),
    }
