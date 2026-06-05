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


def _num(value: Any) -> float | None:
    if value in (None, "", "N/A"):
        return None
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def calculate_derived_fundamentals(period_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [dict(row) for row in (period_rows or [])]
    rows.sort(key=lambda row: str(row.get("period_end") or row.get("period") or ""))

    for index, row in enumerate(rows):
        prev = rows[index - 1] if index > 0 else None
        revenue = _num(row.get("revenue"))
        ebitda = _num(row.get("ebitda"))
        net_profit = _num(row.get("net_profit"))
        operating_cash_flow = _num(row.get("operating_cash_flow") or row.get("cash_from_operations"))
        capex = _num(row.get("capex") or row.get("capital_expenditure"))
        total_debt = _num(row.get("total_debt") or row.get("debt"))
        cash = _num(row.get("cash") or row.get("cash_and_equivalents"))
        current_liabilities = _num(row.get("current_liabilities"))

        row["ebitda_margin"] = safe_div(ebitda, revenue)
        row["net_profit_margin"] = safe_div(net_profit, revenue)
        row["free_cash_flow"] = operating_cash_flow - capex if operating_cash_flow is not None and capex is not None else None
        row["cfo_to_net_income"] = safe_div(operating_cash_flow, net_profit)
        row["net_debt"] = total_debt - cash if total_debt is not None and cash is not None else None
        row["cash_ratio"] = safe_div(cash, current_liabilities)

        if prev:
            row["revenue_growth_percent"] = calculate_growth(revenue, _num(prev.get("revenue")))
            row["net_profit_growth_percent"] = calculate_growth(net_profit, _num(prev.get("net_profit")))
        else:
            row.setdefault("revenue_growth_percent", None)
            row.setdefault("net_profit_growth_percent", None)

    return rows
