from __future__ import annotations

from datetime import date
from typing import Any

from .calculator import build_metric_rows
from .formatter import convert_amount, currency_metadata, format_currency_scaled, number_or_none
from .models import FinancialHighlights, FinancialPointInTimeMetric
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
    company_profile: dict[str, Any] | None = None,
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
        analysis_date=analysis_date,
        dividends=dividends,
        vendor_payloads=vendor_payloads,
    )
    rows, sections, data_quality = build_metric_rows(periods=periods, normalized=normalized)
    metadata = currency_metadata(data_quality.get("currency"))
    profile = company_profile or {}
    market_cap = convert_amount(
        number_or_none(profile.get("market_cap")),
        source_unit="raw",
        scale_divisor=float(metadata["scale_divisor"]),
    )
    point_in_time = [
        FinancialPointInTimeMetric(
            key="market_cap",
            label="Market Cap",
            value=market_cap,
            display=format_currency_scaled(market_cap),
            unit=str(metadata["scale_label"]),
            as_of=parse_analysis_date(analysis_date).isoformat(),
            status="reported" if market_cap is not None else "unavailable",
            source_vendor=(profile.get("data_quality") or {}).get("field_sources", {}).get("market_cap"),
            source_field="market_cap",
        )
    ]
    return FinancialHighlights(
        title="Key Financial Highlights",
        currency=str(metadata["currency"]),
        currency_label=str(metadata["currency_label"]),
        scale=str(metadata["scale"]),
        scale_label=str(metadata["scale_label"]),
        unit_note=str(metadata["unit_note"]),
        analysis_date=parse_analysis_date(analysis_date).isoformat(),
        period_logic="fy22_to_analysis_quarter",
        periods=periods,
        point_in_time=point_in_time,
        sections=sections,
        rows=rows,
        notes=[
            "Periods start from FY22 and extend dynamically based on the analysis date quarter.",
            "Older historical periods remain visible even when vendor data is unavailable; missing values are shown as N/A.",
            f"Amount figures are displayed in {metadata['scale']}s unless the row unit states otherwise.",
            "Percentage values are displayed with the % symbol.",
            "Market Cap is shown as a point-in-time snapshot unless historical period-end market cap is available.",
            "Unavailable values are shown as N/A.",
        ],
        data_quality=data_quality,
    )
