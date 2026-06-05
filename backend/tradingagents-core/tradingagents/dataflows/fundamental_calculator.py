"""Derived fundamental metric calculator."""

from __future__ import annotations

from typing import Any

from .normalizers import normalized_number


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


def _num(value: Any, *, unit: str = "raw", currency: str = "IDR") -> float | None:
    if isinstance(value, dict):
        candidate = value.get("normalized_value")
        if candidate is None:
            candidate = value.get("value") or value.get("raw_value")
        unit = str(value.get("normalized_unit") or value.get("raw_unit") or unit)
        currency = str(value.get("normalized_currency") or value.get("raw_currency") or currency)
        return normalized_number(candidate, unit=unit, currency=currency) if value.get("normalized_value") is None else _plain_number(candidate)
    return normalized_number(value, unit=unit, currency=currency)


def _plain_number(value: Any) -> float | None:
    if value in (None, "", "N/A"):
        return None
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number == number else None


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
        unit = str(row.get("unit") or "raw")
        currency = str(row.get("currency") or "IDR")
        revenue = _num(row.get("revenue"), unit=unit, currency=currency)
        ebitda = _num(row.get("ebitda"), unit=unit, currency=currency)
        net_profit = _num(row.get("net_profit"), unit=unit, currency=currency)
        operating_cash_flow = _num(row.get("operating_cash_flow") or row.get("cash_from_operations"), unit=unit, currency=currency)
        capex = _num(row.get("capex") or row.get("capital_expenditure"), unit=unit, currency=currency)
        total_debt = _num(row.get("total_debt") or row.get("debt"), unit=unit, currency=currency)
        cash = _num(row.get("cash") or row.get("cash_and_equivalents"), unit=unit, currency=currency)
        current_liabilities = _num(row.get("current_liabilities"), unit=unit, currency=currency)

        ebitda_margin = safe_div(ebitda, revenue)
        net_profit_margin = safe_div(net_profit, revenue)
        free_cash_flow = operating_cash_flow - capex if operating_cash_flow is not None and capex is not None else None
        cfo_to_net_income = safe_div(operating_cash_flow, net_profit)
        net_debt = total_debt - cash if total_debt is not None and cash is not None else None
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
            prev_unit = str(prev.get("unit") or unit)
            prev_currency = str(prev.get("currency") or currency)
            revenue_growth = calculate_growth(revenue, _num(prev.get("revenue"), unit=prev_unit, currency=prev_currency))
            net_profit_growth = calculate_growth(net_profit, _num(prev.get("net_profit"), unit=prev_unit, currency=prev_currency))
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
