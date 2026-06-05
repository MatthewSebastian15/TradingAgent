"""Derived fundamental metric calculator."""

from __future__ import annotations

from typing import Any


def safe_div(numerator: float | int | None, denominator: float | int | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    try:
        return float(numerator) / float(denominator)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def calculate_growth(current: float | int | None, previous: float | int | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    try:
        return (float(current) - float(previous)) / abs(float(previous)) * 100
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def get_normalized_value(row: dict[str, Any], field: str) -> float | None:
    value = row.get(field)
    if isinstance(value, dict):
        normalized = value.get("normalized_value")
        if isinstance(normalized, (int, float)) and not isinstance(normalized, bool):
            return float(normalized)
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _first_normalized_value(row: dict[str, Any], *fields: str) -> float | None:
    for field in fields:
        value = get_normalized_value(row, field)
        if value is not None:
            return value
    return None


def calculate_margin(numerator: float | int | None, revenue: float | int | None) -> float | None:
    return safe_div(numerator, revenue)


def calculate_fcf(operating_cash_flow: float | int | None, capex: float | int | None) -> float | None:
    if operating_cash_flow is None or capex is None:
        return None
    return float(operating_cash_flow) - float(capex)


def calculate_cfo_to_net_income(operating_cash_flow: float | int | None, net_profit: float | int | None) -> float | None:
    return safe_div(operating_cash_flow, net_profit)


def calculate_net_debt(total_debt: float | int | None, cash: float | int | None) -> float | None:
    if total_debt is None or cash is None:
        return None
    return float(total_debt) - float(cash)


def _calculated(value: float | None, formula: str, warnings: list[str] | None = None) -> dict[str, Any]:
    return {
        "value": value,
        "status": "calculated" if value is not None else "source_unavailable",
        "source": "local_calculation_from_normalized_financials",
        "formula": formula,
        "warnings": warnings or [],
    }


def calculate_derived_fundamentals(period_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Calculate derived metrics from normalized annual/quarter rows.

    Legacy numeric keys are preserved for existing consumers. Detailed metadata
    is added under ``derived_metrics`` so API/UI callers can show calculation
    source and status without breaking old text builders. Humanity survives one
    more backwards-compatible schema change.
    """
    rows = [dict(row) for row in (period_rows or [])]
    rows.sort(key=lambda row: str((row.get("period") or {}).get("period_end") if isinstance(row.get("period"), dict) else row.get("period_end") or row.get("period") or ""))

    for index, row in enumerate(rows):
        prev = rows[index - 1] if index > 0 else None
        revenue = get_normalized_value(row, "revenue")
        ebitda = get_normalized_value(row, "ebitda")
        net_profit = get_normalized_value(row, "net_profit")
        operating_cash_flow = _first_normalized_value(row, "operating_cash_flow", "cash_from_operations")
        capex = _first_normalized_value(row, "capex", "capital_expenditure")
        total_debt = _first_normalized_value(row, "total_debt", "debt")
        cash = _first_normalized_value(row, "cash", "cash_and_equivalents")
        current_liabilities = get_normalized_value(row, "current_liabilities")

        ebitda_margin = calculate_margin(ebitda, revenue)
        net_profit_margin = calculate_margin(net_profit, revenue)
        free_cash_flow = calculate_fcf(operating_cash_flow, capex)
        cfo_to_net_income = calculate_cfo_to_net_income(operating_cash_flow, net_profit)
        net_debt = calculate_net_debt(total_debt, cash)
        cash_ratio = safe_div(cash, current_liabilities)

        row["ebitda_margin"] = ebitda_margin
        row["net_profit_margin"] = net_profit_margin
        row["free_cash_flow"] = free_cash_flow
        row["cfo_to_net_income"] = cfo_to_net_income
        row["net_debt"] = net_debt
        row["cash_ratio"] = cash_ratio

        derived_metrics = {
            "ebitda_margin": _calculated(ebitda_margin, "ebitda / revenue"),
            "net_profit_margin": _calculated(net_profit_margin, "net_profit / revenue"),
            "free_cash_flow": _calculated(free_cash_flow, "operating_cash_flow - capex"),
            "cfo_to_net_income": _calculated(cfo_to_net_income, "operating_cash_flow / net_profit"),
            "net_debt": _calculated(net_debt, "total_debt - cash"),
            "cash_ratio": _calculated(cash_ratio, "cash / current_liabilities"),
        }

        if prev:
            revenue_growth = calculate_growth(revenue, get_normalized_value(prev, "revenue"))
            net_profit_growth = calculate_growth(net_profit, get_normalized_value(prev, "net_profit"))
            row["revenue_growth_percent"] = revenue_growth
            row["net_profit_growth_percent"] = net_profit_growth
            derived_metrics["revenue_growth_percent"] = _calculated(
                revenue_growth,
                "(current_revenue - previous_revenue) / abs(previous_revenue) * 100",
                [] if revenue_growth is not None else ["previous revenue is missing or zero"],
            )
            derived_metrics["net_profit_growth_percent"] = _calculated(
                net_profit_growth,
                "(current_net_profit - previous_net_profit) / abs(previous_net_profit) * 100",
                [] if net_profit_growth is not None else ["previous net profit is missing or zero"],
            )
        else:
            row.setdefault("revenue_growth_percent", None)
            row.setdefault("net_profit_growth_percent", None)
            derived_metrics["revenue_growth_percent"] = _calculated(None, "requires previous revenue", ["previous period unavailable"])
            derived_metrics["net_profit_growth_percent"] = _calculated(None, "requires previous net profit", ["previous period unavailable"])

        row["derived_metrics"] = derived_metrics

    return rows
