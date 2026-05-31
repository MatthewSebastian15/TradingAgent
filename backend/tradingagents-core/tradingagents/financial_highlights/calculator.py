from __future__ import annotations

from typing import Any

from .models import FinancialCell, FinancialHighlightRow, FinancialPeriod

MONEY_SCALE = 1_000_000_000


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def _format_number(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "N/A"
    rendered = f"{value:,.{decimals}f}"
    return rendered.rstrip("0").rstrip(".")


def _unavailable_cell() -> FinancialCell:
    return FinancialCell(value=None, display="N/A", status="unavailable")


def _record(normalized: dict[str, Any], period_key: str, field: str) -> dict[str, Any] | None:
    value = normalized.get("periods", {}).get(period_key, {}).get(field)
    return value if isinstance(value, dict) else None


def _number(normalized: dict[str, Any], period_key: str, field: str) -> float | None:
    item = _record(normalized, period_key, field)
    value = item.get("value") if item else None
    return float(value) if isinstance(value, (int, float)) else None


def _reported_cell(record: dict[str, Any] | None, *, scale: float = 1, decimals: int = 2) -> FinancialCell:
    if not record or not isinstance(record.get("value"), (int, float)):
        return _unavailable_cell()
    value = float(record["value"]) / scale
    return FinancialCell(
        value=value,
        display=_format_number(value, decimals),
        status="reported",
        source_vendor=record.get("source_vendor"),
        source_field=record.get("source_field"),
    )


def _calculated_cell(value: float | None, formula: str, *, scale: float = 1, decimals: int = 2) -> FinancialCell:
    if value is None:
        return _unavailable_cell()
    scaled = value / scale
    return FinancialCell(
        value=scaled,
        display=_format_number(scaled, decimals),
        status="calculated",
        formula=formula,
    )


def _previous_period_key(period: FinancialPeriod) -> str:
    suffix = f"Q{period.quarter}" if period.quarter else ""
    return f"FY{str(period.year - 1)[-2:]}{suffix}"


def _previous_equity_period_key(period: FinancialPeriod) -> str:
    if period.type == "annual" or period.quarter == 1:
        return f"FY{str(period.year - 1)[-2:]}"
    return f"FY{str(period.year)[-2:]}Q{int(period.quarter or 1) - 1}"


def _build_period_cells(period: FinancialPeriod, normalized: dict[str, Any]) -> dict[str, FinancialCell]:
    key = period.key
    previous_key = _previous_period_key(period)
    revenue = _number(normalized, key, "revenue")
    previous_revenue = _number(normalized, previous_key, "revenue")
    ebitda = _number(normalized, key, "ebitda")
    net_profit = _number(normalized, key, "net_profit")
    previous_net_profit = _number(normalized, previous_key, "net_profit")
    total_equity = _number(normalized, key, "total_equity")
    previous_equity = _number(normalized, _previous_equity_period_key(period), "total_equity")
    total_debt = _number(normalized, key, "total_debt")
    shares_outstanding = _number(normalized, key, "shares_outstanding")
    dividend_per_share = _number(normalized, key, "dividend_per_share")
    reference_price = _number(normalized, key, "reference_price")

    revenue_growth = safe_divide(
        revenue - previous_revenue if revenue is not None and previous_revenue is not None else None,
        previous_revenue,
    )
    net_profit_growth = safe_divide(
        net_profit - previous_net_profit
        if net_profit is not None and previous_net_profit is not None
        else None,
        previous_net_profit,
    )
    average_equity = (
        (total_equity + previous_equity) / 2
        if total_equity is not None and previous_equity is not None
        else None
    )

    eps_record = _record(normalized, key, "eps")
    eps_cell = _reported_cell(eps_record)
    if eps_cell.status == "unavailable":
        eps_cell = _calculated_cell(safe_divide(net_profit, shares_outstanding), "Net Profit / Shares Outstanding")

    dividend_yield_record = _record(normalized, key, "dividend_yield")
    dividend_yield_cell = _reported_cell(dividend_yield_record)
    if dividend_yield_cell.status == "unavailable":
        dividend_yield_cell = _calculated_cell(
            safe_divide(dividend_per_share, reference_price) * 100
            if safe_divide(dividend_per_share, reference_price) is not None
            else None,
            "Dividend per Share / Reference Price * 100",
        )

    return {
        "revenue": _reported_cell(_record(normalized, key, "revenue"), scale=MONEY_SCALE, decimals=1),
        "revenue_growth": _calculated_cell(
            revenue_growth * 100 if revenue_growth is not None else None,
            "(Revenue current - Revenue previous) / Revenue previous * 100",
        ),
        "ebitda": _reported_cell(_record(normalized, key, "ebitda"), scale=MONEY_SCALE, decimals=1),
        "ebitda_margin": _calculated_cell(
            safe_divide(ebitda, revenue) * 100 if safe_divide(ebitda, revenue) is not None else None,
            "EBITDA / Revenue * 100",
        ),
        "net_profit": _reported_cell(_record(normalized, key, "net_profit"), scale=MONEY_SCALE, decimals=1),
        "net_profit_growth": _calculated_cell(
            net_profit_growth * 100 if net_profit_growth is not None else None,
            "(Net Profit current - Net Profit previous) / Net Profit previous * 100",
        ),
        "net_profit_margin": _calculated_cell(
            safe_divide(net_profit, revenue) * 100 if safe_divide(net_profit, revenue) is not None else None,
            "Net Profit / Revenue * 100",
        ),
        "roe": _calculated_cell(
            safe_divide(net_profit, average_equity) * 100
            if safe_divide(net_profit, average_equity) is not None
            else None,
            "Net Profit / Average Equity * 100",
        ),
        "eps": eps_cell,
        "bvps": _calculated_cell(safe_divide(total_equity, shares_outstanding), "Total Equity / Shares Outstanding"),
        "der": _calculated_cell(safe_divide(total_debt, total_equity), "Total Debt / Total Equity"),
        "dividend_yield": dividend_yield_cell,
    }


def build_metric_rows(
    *,
    periods: list[FinancialPeriod],
    normalized: dict[str, Any],
) -> tuple[list[FinancialHighlightRow], dict[str, Any]]:
    currency = str(normalized.get("currency") or "").upper() or None
    currency_unit = f"{currency} Bn" if currency else "Currency Bn"
    per_share_unit = f"{currency}/share" if currency else "Currency/share"
    definitions = [
        ("revenue", "Revenue", currency_unit),
        ("revenue_growth", "Revenue Growth (%)", "%"),
        ("ebitda", "EBITDA", currency_unit),
        ("ebitda_margin", "EBITDA Margin (%)", "%"),
        ("net_profit", "Net Profit", currency_unit),
        ("net_profit_growth", "Net Profit Growth (%)", "%"),
        ("net_profit_margin", "Net Profit Margin (%)", "%"),
        ("roe", "ROE (%)", "%"),
        ("eps", "EPS", per_share_unit),
        ("bvps", "BVPS", per_share_unit),
        ("der", "DER", "Ratio"),
        ("dividend_yield", "Dividend Yield (%)", "%"),
    ]
    cells_by_period = {period.key: _build_period_cells(period, normalized) for period in periods}
    rows = [
        FinancialHighlightRow(
            key=key,
            label=label,
            unit=unit,
            values={period.key: cells_by_period[period.key][key] for period in periods},
        )
        for key, label, unit in definitions
    ]

    missing_metrics = [
        row.key
        for row in rows
        if all(cell.status == "unavailable" for cell in row.values.values())
    ]
    missing_periods = [
        period.key
        for period in periods
        if all(row.values[period.key].status == "unavailable" for row in rows)
    ]
    available_count = sum(
        cell.status != "unavailable"
        for row in rows
        for cell in row.values.values()
    )
    total_count = len(rows) * len(periods)
    status = "unavailable" if available_count == 0 else "complete" if available_count == total_count else "partial"

    return rows, {
        "status": status,
        "currency": currency,
        "missing_metrics": missing_metrics,
        "missing_periods": missing_periods,
        "sources_used": list(normalized.get("sources_used") or []),
    }
