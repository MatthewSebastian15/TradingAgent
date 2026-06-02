from __future__ import annotations

from typing import Any

from .formatter import convert_amount, currency_metadata, format_financial_value
from .models import FinancialCell, FinancialHighlightRow, FinancialHighlightSection, FinancialPeriod

METRIC_SECTIONS = [
    {
        "key": "market_scale",
        "title": "Market & Scale",
        "description": "Business size and earnings scale.",
        "rows": [
            ("revenue", "Revenue", "currency_scaled"),
            ("ebitda", "EBITDA", "currency_scaled"),
            ("net_profit", "Net Profit", "currency_scaled"),
        ],
    },
    {
        "key": "growth",
        "title": "Growth",
        "description": "Revenue and net profit growth trends.",
        "rows": [
            ("revenue_growth", "Revenue Growth (%)", "percent"),
            ("net_profit_growth", "Net Profit Growth (%)", "percent"),
        ],
    },
    {
        "key": "profitability",
        "title": "Profitability",
        "description": "Margin and return quality.",
        "rows": [
            ("ebitda_margin", "EBITDA Margin (%)", "percent"),
            ("net_profit_margin", "Net Profit Margin / Profit Margin (%)", "percent"),
            ("roe", "ROE (%)", "percent"),
        ],
    },
    {
        "key": "per_share_balance_sheet",
        "title": "Per Share & Balance Sheet",
        "description": "Per-share value and leverage metrics.",
        "rows": [
            ("eps", "EPS", "per_share"),
            ("bvps", "BVPS", "per_share"),
            ("der", "DER", "ratio"),
        ],
    },
    {
        "key": "dividends",
        "title": "Dividends",
        "description": "Dividend return and distribution policy.",
        "rows": [
            ("dividend_yield", "Dividend Yield (%)", "percent"),
            ("payout_ratio", "Payout Ratio (%)", "percent"),
        ],
    },
]


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def safe_percent(numerator: float | None, denominator: float | None) -> float | None:
    ratio = safe_divide(numerator, denominator)
    return ratio * 100 if ratio is not None else None


def safe_growth_percent(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return ((current - previous) / previous) * 100


def calculate_payout_ratio(dividend_per_share: float | None, eps: float | None) -> float | None:
    return safe_percent(dividend_per_share, eps)


def _unavailable_cell() -> FinancialCell:
    return FinancialCell(value=None, display="N/A", status="unavailable")


def _record(normalized: dict[str, Any], period_key: str, field: str) -> dict[str, Any] | None:
    value = normalized.get("periods", {}).get(period_key, {}).get(field)
    return value if isinstance(value, dict) else None


def _number(normalized: dict[str, Any], period_key: str, field: str) -> float | None:
    item = _record(normalized, period_key, field)
    value = item.get("value") if item else None
    return float(value) if isinstance(value, (int, float)) else None


def _reported_cell(
    record: dict[str, Any] | None,
    *,
    format_type: str = "number",
    scale_divisor: float = 1,
    percent_ratio: bool = False,
) -> FinancialCell:
    if not record or not isinstance(record.get("value"), (int, float)):
        return _unavailable_cell()
    raw_value = float(record["value"])
    if format_type == "currency_scaled":
        value = convert_amount(raw_value, source_unit=record.get("source_unit"), scale_divisor=scale_divisor)
    elif percent_ratio and abs(raw_value) <= 1:
        value = raw_value * 100
    else:
        value = raw_value
    return FinancialCell(
        value=value,
        display=format_financial_value(value, format_type),
        status="reported",
        source_vendor=record.get("source_vendor"),
        source_field=record.get("source_field"),
    )


def _calculated_cell(value: float | None, formula: str, *, format_type: str = "number") -> FinancialCell:
    if value is None:
        return _unavailable_cell()
    return FinancialCell(
        value=value,
        display=format_financial_value(value, format_type),
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


def _build_period_cells(
    period: FinancialPeriod,
    normalized: dict[str, Any],
    *,
    scale_divisor: float,
) -> dict[str, FinancialCell]:
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
    reported_eps = _number(normalized, key, "eps")
    eps_value = reported_eps if reported_eps is not None else safe_divide(net_profit, shares_outstanding)
    average_equity = (
        (total_equity + previous_equity) / 2 if total_equity is not None and previous_equity is not None else None
    )
    eps_cell = _reported_cell(_record(normalized, key, "eps"), format_type="per_share")
    if eps_cell.status == "unavailable":
        eps_cell = _calculated_cell(eps_value, "Net Profit / Shares Outstanding", format_type="per_share")
    dividend_yield_cell = _reported_cell(
        _record(normalized, key, "dividend_yield"),
        format_type="percent",
        percent_ratio=True,
    )
    if dividend_yield_cell.status == "unavailable":
        dividend_yield_cell = _calculated_cell(
            safe_percent(dividend_per_share, reference_price),
            "Dividend per Share / Reference Price * 100",
            format_type="percent",
        )
    return {
        "revenue": _reported_cell(
            _record(normalized, key, "revenue"),
            format_type="currency_scaled",
            scale_divisor=scale_divisor,
        ),
        "revenue_growth": _calculated_cell(
            safe_growth_percent(revenue, previous_revenue),
            "(Revenue current - Revenue previous) / Revenue previous * 100",
            format_type="percent",
        ),
        "ebitda": _reported_cell(
            _record(normalized, key, "ebitda"),
            format_type="currency_scaled",
            scale_divisor=scale_divisor,
        ),
        "ebitda_margin": _calculated_cell(
            safe_percent(ebitda, revenue),
            "EBITDA / Revenue * 100",
            format_type="percent",
        ),
        "net_profit": _reported_cell(
            _record(normalized, key, "net_profit"),
            format_type="currency_scaled",
            scale_divisor=scale_divisor,
        ),
        "net_profit_growth": _calculated_cell(
            safe_growth_percent(net_profit, previous_net_profit),
            "(Net Profit current - Net Profit previous) / Net Profit previous * 100",
            format_type="percent",
        ),
        "net_profit_margin": _calculated_cell(
            safe_percent(net_profit, revenue),
            "Net Profit / Revenue * 100",
            format_type="percent",
        ),
        "roe": _calculated_cell(
            safe_percent(net_profit, average_equity if average_equity is not None else total_equity),
            "Net Profit / Average Equity * 100; fallback to Total Equity when average is unavailable",
            format_type="percent",
        ),
        "eps": eps_cell,
        "bvps": _calculated_cell(
            safe_divide(total_equity, shares_outstanding),
            "Total Equity / Shares Outstanding",
            format_type="per_share",
        ),
        "der": _calculated_cell(
            safe_divide(total_debt, total_equity), "Total Debt / Total Equity", format_type="ratio"
        ),
        "dividend_yield": dividend_yield_cell,
        "payout_ratio": _calculated_cell(
            calculate_payout_ratio(dividend_per_share, eps_value),
            "Dividend per Share / EPS * 100",
            format_type="percent",
        ),
    }


def build_metric_rows(
    *,
    periods: list[FinancialPeriod],
    normalized: dict[str, Any],
) -> tuple[list[FinancialHighlightRow], list[FinancialHighlightSection], dict[str, Any]]:
    metadata = currency_metadata(normalized.get("currency"))
    currency_unit = str(metadata["scale_label"])
    per_share_unit = f"{metadata['currency']}/share"
    unit_for_format = {
        "currency_scaled": currency_unit,
        "per_share": per_share_unit,
        "percent": "%",
        "ratio": "x",
        "number": "",
    }
    cells_by_period = {
        period.key: _build_period_cells(period, normalized, scale_divisor=float(metadata["scale_divisor"]))
        for period in periods
    }
    rows: list[FinancialHighlightRow] = []
    sections: list[FinancialHighlightSection] = []
    for section_definition in METRIC_SECTIONS:
        section_rows = []
        for key, label, format_type in section_definition["rows"]:
            row = FinancialHighlightRow(
                key=key,
                label=label,
                unit=unit_for_format[format_type],
                format_type=format_type,
                section_key=section_definition["key"],
                values={period.key: cells_by_period[period.key][key] for period in periods},
            )
            rows.append(row)
            section_rows.append(row)
        sections.append(
            FinancialHighlightSection(
                key=section_definition["key"],
                title=section_definition["title"],
                description=section_definition["description"],
                rows=section_rows,
            )
        )
    missing_metrics = [row.key for row in rows if all(cell.status == "unavailable" for cell in row.values.values())]
    missing_periods = [
        period.key for period in periods if all(row.values[period.key].status == "unavailable" for row in rows)
    ]
    available_count = sum(cell.status != "unavailable" for row in rows for cell in row.values.values())
    total_count = len(rows) * len(periods)
    status = "unavailable" if available_count == 0 else "complete" if available_count == total_count else "partial"
    return (
        rows,
        sections,
        {
            "status": status,
            "currency": metadata["currency"],
            "missing_metrics": missing_metrics,
            "missing_periods": missing_periods,
            "sources_used": list(normalized.get("sources_used") or []),
        },
    )
