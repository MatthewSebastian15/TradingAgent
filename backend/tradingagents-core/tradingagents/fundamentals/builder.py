from __future__ import annotations

from datetime import date
from typing import Any

from tradingagents.financial_highlights.period_resolver import resolve_financial_highlight_periods
from tradingagents.financial_highlights.statement_parser import parse_vendor_financials

from .balance_sheet_risk_builder import build_balance_sheet_risk
from .common import build_snapshot
from .dividend_quality_builder import build_dividend_quality
from .fair_value_builder import build_fair_value_range
from .financial_trends_builder import build_financial_trends
from .peer_comparison_builder import build_peer_comparison
from .quality_of_earnings_builder import build_quality_of_earnings
from .scenario_builder import build_scenario_analysis
from .valuation_multiples_builder import build_valuation_multiples


def build_fundamental_analysis(
    *,
    ticker: str,
    analysis_date: str | date | None,
    financial_highlights: dict[str, Any] | None,
    fundamentals: dict[str, Any] | str | None = None,
    income_statement: Any | None = None,
    balance_sheet: Any | None = None,
    cashflow: Any | None = None,
    dividends: Any | None = None,
    price_data: Any | None = None,
    vendor_payloads: dict[str, Any] | None = None,
    company_profile: dict[str, Any] | None = None,
    current_price: float | None = None,
    peer_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
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
        company_profile=company_profile,
    )
    snapshot = build_snapshot(
        normalized=normalized,
        periods=periods,
        company_profile=company_profile,
        current_price=current_price,
    )
    financial_trends = build_financial_trends(financial_highlights)
    valuation_multiples = build_valuation_multiples(snapshot)
    fair_value_range = build_fair_value_range(snapshot)
    quality_of_earnings = build_quality_of_earnings(snapshot)
    return {
        "financial_trends": financial_trends,
        "valuation_multiples": valuation_multiples,
        "fair_value_range": fair_value_range,
        "scenario_analysis": build_scenario_analysis(snapshot, financial_trends, fair_value_range),
        "quality_of_earnings": quality_of_earnings,
        "balance_sheet_risk": build_balance_sheet_risk(snapshot),
        "dividend_quality": build_dividend_quality(snapshot, quality_of_earnings),
        "peer_comparison": build_peer_comparison(peer_payload),
    }
