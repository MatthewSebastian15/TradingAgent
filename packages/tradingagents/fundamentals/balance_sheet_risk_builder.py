from __future__ import annotations

from typing import Any

from tradingagents.financial_highlights.calculator import safe_divide

from .common import data_quality, effective_ebitda, is_financial_sector, metric, metric_values


def build_balance_sheet_risk(snapshot: dict[str, Any]) -> dict[str, Any]:
    currency = snapshot["currency"]
    debt = snapshot.get("total_debt")
    cash = snapshot.get("cash")
    denominator = snapshot.get("current_liabilities")
    fallbacks = []
    if denominator is None and snapshot.get("total_liabilities") is not None:
        denominator = snapshot.get("total_liabilities")
        fallbacks.append("Cash ratio uses total liabilities because current liabilities are unavailable")
    ebitda, ebitda_status, _source = effective_ebitda(snapshot)
    if ebitda_status == "estimated":
        fallbacks.append("EBITDA estimated from operating income")
    details = {
        "der": metric(
            safe_divide(debt, snapshot.get("total_equity")),
            currency=currency,
            format_type="ratio",
            formula="Total Debt / Total Equity",
        ),
        "net_debt": metric(
            debt - cash if debt is not None and cash is not None else None,
            currency=currency,
            format_type="currency",
            formula="Total Debt - Cash",
        ),
        "debt_to_ebitda": metric(
            safe_divide(debt, ebitda),
            currency=currency,
            format_type="ratio",
            formula="Total Debt / EBITDA",
            status="estimated" if ebitda_status == "estimated" and debt is not None else "calculated",
        ),
        "cash_ratio": metric(
            safe_divide(cash, denominator),
            currency=currency,
            format_type="ratio",
            formula="Cash / Current Liabilities; fallback to Total Liabilities",
        ),
        "equity_ratio": metric(
            safe_divide(snapshot.get("total_equity"), snapshot.get("total_assets")),
            currency=currency,
            format_type="ratio",
            formula="Total Equity / Total Assets",
        ),
    }
    values = metric_values(details)
    warnings = []
    if is_financial_sector(snapshot):
        risk_level = "N/A"
        warnings.append("Generic DER risk level is not applied to financial-sector companies. Use sector-specific review.")
    elif values["der"] is None and values["debt_to_ebitda"] is None:
        risk_level = "N/A"
    elif (values["der"] or 0) > 2 or (values["debt_to_ebitda"] or 0) > 4:
        risk_level = "high"
    elif (values["der"] or 0) > 1 or (values["debt_to_ebitda"] or 0) > 2:
        risk_level = "moderate"
    else:
        risk_level = "low"
    return {
        **values,
        "metric_details": details,
        "risk_level": risk_level,
        "risk_flags": warnings or ["Leverage metrics are calculated from the latest available statements."],
        "data_quality": data_quality(details, fallback_used=fallbacks, warnings=warnings),
    }
