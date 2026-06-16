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

FUNDAMENTAL_CHART_REGISTRY: dict[str, list[dict[str, Any]]] = {
    "income": [
        {"id": "income-revenue-ebitda-net-profit", "title": "Revenue, EBITDA, Net Profit", "type": "grouped_bar", "metrics": ["revenue", "ebitda", "net_profit"], "unit": "currency"},
        {"id": "income-growth", "title": "Revenue Growth (%) vs Net Profit Growth (%)", "type": "line", "metrics": ["revenue_growth", "net_profit_growth"], "unit": "percent"},
        {"id": "income-margin", "title": "EBITDA Margin (%) vs Net Profit Margin (%)", "type": "line", "metrics": ["ebitda_margin", "net_profit_margin"], "unit": "percent"},
        {"id": "income-eps", "title": "EPS", "type": "line", "metrics": ["eps"], "unit": "number"},
        {"id": "income-gross-profit-cost-revenue", "title": "Gross Profit vs Cost of Revenue", "type": "grouped_bar", "metrics": ["gross_profit", "cost_of_revenue"], "unit": "currency"},
        {"id": "income-operating-pretax-net-profit", "title": "Operating Income / EBIT vs Pretax Income vs Net Profit", "type": "grouped_bar", "metrics": ["operating_income", "pretax_income", "net_profit"], "unit": "currency"},
    ],
    "balance_sheet": [
        {"id": "balance-bvps", "title": "BVPS", "type": "line", "metrics": ["bvps"], "unit": "number"},
        {"id": "balance-net-debt", "title": "Net Debt", "type": "bar", "metrics": ["net_debt"], "unit": "currency"},
        {"id": "balance-cash-equity-ratio", "title": "Cash Ratio vs Equity Ratio", "type": "line", "metrics": ["cash_ratio", "equity_ratio"], "unit": "ratio_percent_mixed"},
        {"id": "balance-assets-liabilities-equity", "title": "Total Assets vs Total Liabilities vs Total Equity", "type": "grouped_bar", "metrics": ["total_assets", "total_liabilities", "total_equity"], "unit": "currency"},
        {"id": "balance-current-working-capital", "title": "Current Assets vs Current Liabilities vs Working Capital", "type": "grouped_bar", "metrics": ["current_assets", "current_liabilities", "working_capital"], "unit": "currency"},
        {"id": "balance-liquidity-debt-ratios", "title": "Current Ratio vs Quick Ratio vs Debt Ratio", "type": "line", "metrics": ["current_ratio", "quick_ratio", "debt_ratio"], "unit": "ratio"},
    ],
    "cash_flow": [
        {"id": "cashflow-free-cash-flow", "title": "Free Cash Flow", "type": "bar", "metrics": ["free_cash_flow"], "unit": "currency"},
        {"id": "cashflow-cfo-net-income", "title": "CFO / Net Income", "type": "line", "metrics": ["cfo_to_net_income"], "unit": "ratio"},
        {"id": "cashflow-capex-fcf-coverage", "title": "Capex Intensity (%) vs FCF Coverage", "type": "line", "metrics": ["capex_intensity_percent", "fcf_coverage"], "unit": "percent_ratio_mixed"},
        {"id": "cashflow-operating-investing-financing", "title": "Operating Cash Flow vs Investing Cash Flow vs Financing Cash Flow", "type": "grouped_bar", "metrics": ["operating_cash_flow", "investing_cash_flow", "financing_cash_flow"], "unit": "currency"},
        {"id": "cashflow-capex-fcf", "title": "Capital Expenditure vs Free Cash Flow", "type": "grouped_bar", "metrics": ["capital_expenditure", "free_cash_flow"], "unit": "currency"},
        {"id": "cashflow-fcf-cfo-growth", "title": "FCF Margin (%) vs FCF Growth (%) vs CFO Growth (%)", "type": "line", "metrics": ["fcf_margin", "fcf_growth", "cfo_growth"], "unit": "percent"},
    ],
    "ratios": [
        {"id": "ratios-roe", "title": "ROE (%)", "type": "line", "metrics": ["roe"], "unit": "percent"},
        {"id": "ratios-leverage-risk", "title": "DER vs Debt / EBITDA", "type": "line", "metrics": ["der", "debt_to_ebitda"], "unit": "ratio"},
        {"id": "ratios-dividend-quality", "title": "Dividend Yield (%) vs Payout Ratio (%)", "type": "line", "metrics": ["dividend_yield", "payout_ratio"], "unit": "percent"},
        {"id": "ratios-market-cap-enterprise-value", "title": "Market Cap vs Enterprise Value", "type": "grouped_bar", "metrics": ["market_cap", "enterprise_value"], "unit": "currency"},
        {"id": "ratios-return-quality", "title": "ROA (%) vs ROIC (%) vs ROE (%)", "type": "line", "metrics": ["roa", "roic", "roe"], "unit": "percent"},
        {"id": "ratios-yield-quality", "title": "FCF Yield (%) vs Earnings Yield (%)", "type": "line", "metrics": ["fcf_yield", "earnings_yield"], "unit": "percent"},
    ],
}

SECTION_WEIGHTS = {"income": 0.25, "balance_sheet": 0.25, "cash_flow": 0.30, "ratios": 0.20}
SIGNAL_SCORES = {"bullish": 1.0, "neutral": 0.55, "mixed": 0.5, "bearish": 0.0}
NULLABLE_METRIC_KEYS = {
    "eps",
    "ebitda",
    "interest_expense",
    "total_debt",
    "stock_based_compensation",
    "cash_dividends_paid",
    "share_repurchase",
    "peg_ratio",
    "beta",
    "shares_outstanding",
    "float_shares",
}


def _row_map(financial_highlights: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    return {
        str(row.get("key")): row
        for row in (financial_highlights or {}).get("rows") or []
        if isinstance(row, dict) and row.get("key")
    }


def _periods(financial_highlights: dict[str, Any] | None) -> list[dict[str, Any]]:
    return [period for period in (financial_highlights or {}).get("periods") or [] if isinstance(period, dict)]


def _cell(row: dict[str, Any] | None, period_key: str | None) -> dict[str, Any] | None:
    if not row or not period_key:
        return None
    values = row.get("values") if isinstance(row.get("values"), dict) else {}
    item = values.get(period_key)
    return item if isinstance(item, dict) else None


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _series(row: dict[str, Any] | None, periods: list[dict[str, Any]]) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for period in periods:
        period_key = period.get("key")
        cell = _cell(row, period_key)
        value = cell.get("value") if isinstance(cell, dict) else None
        points.append(
            {
                "period": period_key,
                "label": period.get("display_period") or period.get("label") or period_key,
                "value": value if _is_number(value) else None,
                "display": (cell or {}).get("display") or "N/A",
                "status": (cell or {}).get("status") or "unavailable",
            }
        )
    return points


def _latest_point(points: list[dict[str, Any]]) -> dict[str, Any] | None:
    for point in reversed(points):
        if _is_number(point.get("value")):
            return point
    return None


def _direction(points: list[dict[str, Any]]) -> str:
    values = [point.get("value") for point in points if _is_number(point.get("value"))]
    if len(values) < 2:
        return "unavailable"
    if values[-1] > values[0]:
        return "rising"
    if values[-1] < values[0]:
        return "falling"
    return "stable"


def _metric_availability(rows: dict[str, dict[str, Any]], periods: list[dict[str, Any]]) -> dict[str, str]:
    availability = {}
    for key, row in rows.items():
        cells = [_cell(row, period.get("key")) for period in periods]
        available = [cell for cell in cells if isinstance(cell, dict) and cell.get("status") != "unavailable"]
        if not available:
            availability[key] = "unavailable"
        elif len(available) == len(cells):
            availability[key] = "complete"
        else:
            availability[key] = "partial"
    return availability


def _chart_data_quality(series_by_metric: dict[str, list[dict[str, Any]]]) -> str:
    statuses = []
    for points in series_by_metric.values():
        values = [point for point in points if _is_number(point.get("value"))]
        if not values:
            statuses.append("unavailable")
        elif len(values) == len(points):
            statuses.append("complete")
        else:
            statuses.append("partial")
    if not statuses or all(status == "unavailable" for status in statuses):
        return "unavailable"
    if all(status == "complete" for status in statuses):
        return "complete"
    return "partial"


def _signal_for_chart(chart_id: str, series_by_metric: dict[str, list[dict[str, Any]]]) -> str:
    direction = {key: _direction(points) for key, points in series_by_metric.items()}
    latest = {key: (_latest_point(points) or {}).get("value") for key, points in series_by_metric.items()}
    if not any(_is_number(value) for value in latest.values()):
        return "unavailable"

    if chart_id == "income-growth":
        if direction.get("revenue_growth") == "rising" and direction.get("net_profit_growth") == "rising":
            return "bullish"
        if direction.get("revenue_growth") == "rising" and direction.get("net_profit_growth") == "falling":
            return "mixed"
    if chart_id == "income-margin":
        if direction.get("ebitda_margin") == "rising" and direction.get("net_profit_margin") == "rising":
            return "bullish"
        if "falling" in {direction.get("ebitda_margin"), direction.get("net_profit_margin")}:
            return "bearish"
    if chart_id == "income-eps":
        return "bullish" if direction.get("eps") == "rising" else "bearish" if direction.get("eps") == "falling" else "neutral"
    if chart_id == "income-gross-profit-cost-revenue":
        gross = direction.get("gross_profit")
        cost = direction.get("cost_of_revenue")
        if gross == "rising" and cost != "rising":
            return "bullish"
        if gross == "falling" and cost == "rising":
            return "bearish"
    if chart_id == "income-operating-pretax-net-profit":
        if direction.get("operating_income") == "falling" and direction.get("net_profit") != "rising":
            return "bearish"
        if direction.get("operating_income") == "rising" and direction.get("net_profit") == "rising":
            return "bullish"
    if chart_id == "balance-net-debt":
        return "bearish" if direction.get("net_debt") == "rising" else "bullish" if direction.get("net_debt") == "falling" else "neutral"
    if chart_id == "balance-current-working-capital":
        value = latest.get("working_capital")
        if _is_number(value) and value < 0 and direction.get("working_capital") == "falling":
            return "bearish"
        if _is_number(value) and value > 0:
            return "bullish"
    if chart_id == "balance-liquidity-debt-ratios":
        current_ratio = latest.get("current_ratio")
        quick_ratio = latest.get("quick_ratio")
        debt_ratio_dir = direction.get("debt_ratio")
        if _is_number(quick_ratio) and quick_ratio < 1 and direction.get("quick_ratio") == "falling":
            return "bearish"
        if _is_number(current_ratio) and current_ratio >= 1 and debt_ratio_dir != "rising":
            return "bullish"
    if chart_id == "cashflow-free-cash-flow":
        value = latest.get("free_cash_flow")
        if _is_number(value) and value > 0 and direction.get("free_cash_flow") == "rising":
            return "bullish"
        if _is_number(value) and value < 0:
            return "bearish"
    if chart_id == "cashflow-cfo-net-income":
        value = latest.get("cfo_to_net_income")
        return "bullish" if _is_number(value) and value > 1 else "neutral" if _is_number(value) else "unavailable"
    if chart_id == "cashflow-capex-fcf-coverage":
        if direction.get("capex_intensity_percent") == "rising" and direction.get("fcf_coverage") == "falling":
            return "bearish"
    if chart_id == "cashflow-fcf-cfo-growth":
        if direction.get("fcf_margin") == "rising" and direction.get("fcf_growth") == "rising":
            return "bullish"
        if direction.get("fcf_margin") == "falling" or direction.get("cfo_growth") == "falling":
            return "bearish"
    if chart_id == "ratios-return-quality":
        if direction.get("roe") == "rising" and direction.get("roa") == "rising" and direction.get("roic") == "rising":
            return "bullish"
        if direction.get("roe") == "rising" and direction.get("roa") == "falling":
            return "mixed"
    if chart_id == "ratios-leverage-risk":
        if direction.get("der") == "rising" and direction.get("debt_to_ebitda") == "rising":
            return "bearish"
        if direction.get("der") == "falling" and direction.get("debt_to_ebitda") == "falling":
            return "bullish"
    if chart_id == "ratios-yield-quality":
        if direction.get("fcf_yield") == "rising" or direction.get("earnings_yield") == "rising":
            return "bullish"
    if chart_id == "ratios-dividend-quality":
        if direction.get("payout_ratio") == "rising" and direction.get("dividend_yield") != "rising":
            return "bearish"

    rising = sum(1 for value in direction.values() if value == "rising")
    falling = sum(1 for value in direction.values() if value == "falling")
    if rising and not falling:
        return "bullish"
    if falling and not rising:
        return "bearish"
    if rising and falling:
        return "mixed"
    return "neutral"


def _chart_summary_text(title: str, signal: str, data_quality: str) -> str:
    if signal == "unavailable" or data_quality == "unavailable":
        return f"{title} has no usable fundamental data."
    return f"{title} produces a {signal} signal with {data_quality} data quality."


def build_fundamental_chart_sections(financial_highlights: dict[str, Any] | None) -> list[dict[str, Any]]:
    rows = _row_map(financial_highlights)
    periods = _periods(financial_highlights)
    sections = []
    for section_key, charts in FUNDAMENTAL_CHART_REGISTRY.items():
        section_charts = []
        for chart in charts:
            data = {metric: _series(rows.get(metric), periods) for metric in chart["metrics"]}
            section_charts.append({**chart, "data": data})
        sections.append({"section": section_key, "layout": {"columns": 2, "rows": 3}, "charts": section_charts})
    return sections


def build_fundamental_context(
    *,
    ticker: str,
    analysis_date: str | date | None,
    financial_highlights: dict[str, Any] | None,
) -> dict[str, Any]:
    rows = _row_map(financial_highlights)
    periods = _periods(financial_highlights)
    latest_period_key = periods[-1].get("key") if periods else None
    metric_availability = _metric_availability(rows, periods)
    sections: dict[str, dict[str, Any]] = {}
    chart_summary: list[dict[str, Any]] = []
    section_signals: dict[str, str] = {}

    for section_key, charts in FUNDAMENTAL_CHART_REGISTRY.items():
        metric_keys = list(dict.fromkeys(metric for chart in charts for metric in chart["metrics"]))
        section_metrics = {}
        for metric_key in metric_keys:
            row = rows.get(metric_key)
            cell = _cell(row, latest_period_key)
            section_metrics[metric_key] = {
                "latest": (cell or {}).get("value"),
                "display": (cell or {}).get("display") or "N/A",
                "unit": row.get("unit") if row else None,
                "series": _series(row, periods),
                "availability": metric_availability.get(metric_key, "unavailable"),
            }
        sections[section_key] = section_metrics

        signals = []
        for chart in charts:
            series_by_metric = {metric: _series(rows.get(metric), periods) for metric in chart["metrics"]}
            quality = _chart_data_quality(series_by_metric)
            signal = _signal_for_chart(chart["id"], series_by_metric)
            signals.append(signal)
            chart_summary.append(
                {
                    "chart_id": chart["id"],
                    "section": section_key,
                    "title": chart["title"],
                    "signal": signal,
                    "summary": _chart_summary_text(chart["title"], signal, quality),
                    "metrics_used": chart["metrics"],
                    "data_quality": quality,
                }
            )
        scored = [SIGNAL_SCORES[signal] for signal in signals if signal in SIGNAL_SCORES]
        if not scored:
            section_signals[section_key] = "unavailable"
        else:
            average = sum(scored) / len(scored)
            section_signals[section_key] = "bullish" if average >= 0.7 else "bearish" if average <= 0.3 else "mixed" if any(signal == "mixed" for signal in signals) else "neutral"

    warnings = []
    missing_nullable = sorted(key for key in NULLABLE_METRIC_KEYS if metric_availability.get(key) == "unavailable")
    if missing_nullable:
        warnings.append(f"Nullable metrics unavailable: {', '.join(missing_nullable)}")
    data_quality_status = (financial_highlights or {}).get("data_quality", {}).get("status") or "unavailable"
    if data_quality_status != "complete":
        warnings.append(f"Fundamental data quality is {data_quality_status}.")

    weighted_score = 0.0
    used_weight = 0.0
    for section_key, weight in SECTION_WEIGHTS.items():
        signal = section_signals.get(section_key)
        if signal in SIGNAL_SCORES:
            weighted_score += SIGNAL_SCORES[signal] * weight
            used_weight += weight
    fundamental_score = round((weighted_score / used_weight) * 100) if used_weight else 0
    fundamental_signal = "bullish" if fundamental_score >= 70 else "bearish" if fundamental_score <= 35 else "neutral" if fundamental_score >= 50 else "mixed"

    return {
        "ticker": ticker,
        "period": "annual",
        "analysis_date": str(analysis_date) if analysis_date else None,
        "currency": (financial_highlights or {}).get("currency"),
        "sections": sections,
        "chart_summary": chart_summary,
        "metric_availability": metric_availability,
        "section_signals": section_signals,
        "data_quality": data_quality_status,
        "warnings": warnings,
        "decision_hints": [item["summary"] for item in chart_summary if item["signal"] in {"bullish", "bearish", "mixed"}],
        "fundamental_score": fundamental_score,
        "fundamental_signal": fundamental_signal,
        "weights": SECTION_WEIGHTS,
        "missing_data": missing_nullable,
    }


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
    fundamental_context = build_fundamental_context(
        ticker=ticker,
        analysis_date=analysis_date,
        financial_highlights=financial_highlights,
    )
    section_signals = fundamental_context.get("section_signals", {})
    chart_summary = fundamental_context.get("chart_summary", [])
    return {
        "financial_trends": financial_trends,
        "valuation_multiples": valuation_multiples,
        "fair_value_range": fair_value_range,
        "scenario_analysis": build_scenario_analysis(snapshot, financial_trends, fair_value_range),
        "quality_of_earnings": quality_of_earnings,
        "balance_sheet_risk": build_balance_sheet_risk(snapshot),
        "dividend_quality": build_dividend_quality(snapshot, quality_of_earnings),
        "peer_comparison": build_peer_comparison(peer_payload),
        "fundamental_charts": build_fundamental_chart_sections(financial_highlights),
        "fundamental_context": fundamental_context,
        "fundamental_score": fundamental_context.get("fundamental_score"),
        "fundamental_signal": fundamental_context.get("fundamental_signal"),
        "income_signal": section_signals.get("income"),
        "balance_sheet_signal": section_signals.get("balance_sheet"),
        "cash_flow_signal": section_signals.get("cash_flow"),
        "ratio_signal": section_signals.get("ratios"),
        "chart_based_reasoning": [item.get("summary") for item in chart_summary],
        "missing_data": fundamental_context.get("missing_data", []),
    }
