from __future__ import annotations

from datetime import date
from typing import Any

from .calculator import build_metric_rows
from .models import FinancialHighlights
from .period_resolver import parse_analysis_date, resolve_financial_highlight_periods
from .statement_parser import parse_vendor_financials


def build_financial_highlights(
    *,
    ticker: str,
    analysis_date: str | date | None,
    fundamentals: dict[str, Any] | str | None = None,
    income_statement: Any | None = None,
    balance_sheet: Any | None = None,
    cashflow: Any | None = None,
    price_data: Any | None = None,
    dividends: Any | None = None,
    vendor_payloads: dict[str, Any] | None = None,
) -> FinancialHighlights:
    periods = resolve_financial_highlight_periods(analysis_date)
    normalized = parse_vendor_financials(
        ticker=ticker,
        periods=periods,
        fundamentals=fundamentals,
        income_statement=income_statement,
        balance_sheet=balance_sheet,
        cashflow=cashflow,
        price_data=price_data,
        dividends=dividends,
        vendor_payloads=vendor_payloads,
    )
    rows, data_quality = build_metric_rows(periods=periods, normalized=normalized)
    return FinancialHighlights(
        title="Key Financial Highlights",
        currency=data_quality.get("currency"),
        scale="billion",
        analysis_date=parse_analysis_date(analysis_date).isoformat(),
        period_logic="analysis_quarter",
        periods=periods,
        rows=rows,
        notes=[
            "Periods are selected dynamically from the analysis date quarter.",
            "Reported values come from vendor financial statements when available.",
            "Calculated values are derived from reported vendor data.",
            "Unavailable values are shown as N/A.",
        ],
        data_quality=data_quality,
    )
