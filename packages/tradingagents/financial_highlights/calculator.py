from __future__ import annotations

from typing import Any

from .formatter import convert_amount, currency_metadata, format_financial_value
from .models import FinancialCell, FinancialHighlightRow, FinancialHighlightSection, FinancialPeriod

METRIC_SECTIONS = [
    {
        "key": "income",
        "title": "Income",
        "description": "Revenue, profit, margin, and per-share earnings metrics.",
        "rows": [
            ("revenue", "Revenue", "currency_scaled"),
            ("ebitda", "EBITDA", "currency_scaled"),
            ("net_profit", "Net Profit", "currency_scaled"),
            ("revenue_growth", "Revenue Growth (%)", "percent"),
            ("net_profit_growth", "Net Profit Growth (%)", "percent"),
            ("ebitda_margin", "EBITDA Margin (%)", "percent"),
            ("net_profit_margin", "Net Profit Margin (%)", "percent"),
            ("eps", "EPS", "per_share"),
            ("gross_profit", "Gross Profit", "currency_scaled"),
            ("cost_of_revenue", "Cost of Revenue", "currency_scaled"),
            ("operating_income", "Operating Income / EBIT", "currency_scaled"),
            ("pretax_income", "Pretax Income", "currency_scaled"),
            ("income_tax_expense", "Income Tax Expense", "currency_scaled"),
            ("interest_expense", "Interest Expense", "currency_scaled"),
            ("ebitda_growth", "EBITDA Growth (%)", "percent"),
            ("operating_income_growth", "Operating Income Growth (%)", "percent"),
            ("gross_margin", "Gross Margin (%)", "percent"),
            ("operating_margin", "Operating Margin (%)", "percent"),
            ("tax_rate", "Tax Rate (%)", "percent"),
        ],
    },
    {
        "key": "balance_sheet",
        "title": "Balance Sheet",
        "description": "Assets, liabilities, equity, liquidity, leverage, and capital structure metrics.",
        "rows": [
            ("bvps", "BVPS", "per_share"),
            ("net_debt", "Net Debt", "currency_scaled"),
            ("cash_ratio", "Cash Ratio", "ratio"),
            ("equity_ratio", "Equity Ratio", "percent"),
            ("total_assets", "Total Assets", "currency_scaled"),
            ("total_liabilities", "Total Liabilities", "currency_scaled"),
            ("total_equity", "Total Equity", "currency_scaled"),
            ("cash", "Cash & Cash Equivalents", "currency_scaled"),
            ("total_debt", "Total Debt", "currency_scaled"),
            ("current_assets", "Current Assets", "currency_scaled"),
            ("current_liabilities", "Current Liabilities", "currency_scaled"),
            ("working_capital", "Working Capital", "currency_scaled"),
            ("invested_capital", "Invested Capital", "currency_scaled"),
            ("net_debt_to_equity", "Net Debt / Equity", "ratio"),
            ("current_ratio", "Current Ratio", "ratio"),
            ("quick_ratio", "Quick Ratio", "ratio"),
            ("debt_ratio", "Debt Ratio", "ratio"),
        ],
    },
    {
        "key": "cash_flow",
        "title": "Cash Flow",
        "description": "Operating, investing, financing, free cash flow, capex, and cash conversion metrics.",
        "rows": [
            ("free_cash_flow", "Free Cash Flow", "currency_scaled"),
            ("cfo_to_net_income", "CFO / Net Income", "ratio"),
            ("capex_intensity_percent", "Capex Intensity (%)", "percent"),
            ("fcf_coverage", "FCF Coverage", "ratio"),
            ("operating_cash_flow", "Operating Cash Flow", "currency_scaled"),
            ("investing_cash_flow", "Investing Cash Flow", "currency_scaled"),
            ("financing_cash_flow", "Financing Cash Flow", "currency_scaled"),
            ("capital_expenditure", "Capital Expenditure", "currency_scaled"),
            ("depreciation_amortization", "Depreciation & Amortization", "currency_scaled"),
            ("change_in_working_capital", "Change in Working Capital", "currency_scaled"),
            ("stock_based_compensation", "Stock Based Compensation", "currency_scaled"),
            ("cash_dividends_paid", "Cash Dividends Paid", "currency_scaled"),
            ("share_repurchase", "Share Repurchase", "currency_scaled"),
            ("fcf_margin", "FCF Margin (%)", "percent"),
            ("fcf_growth", "FCF Growth (%)", "percent"),
            ("cfo_growth", "CFO Growth (%)", "percent"),
            ("dividend_coverage_by_fcf", "Dividend Coverage by FCF", "ratio"),
        ],
    },
    {
        "key": "ratios",
        "title": "Ratios",
        "description": "Return, leverage, valuation, yield, market, and per-share ratio metrics.",
        "rows": [
            ("roe", "ROE (%)", "percent"),
            ("der", "DER", "ratio"),
            ("debt_to_ebitda", "Debt / EBITDA", "ratio"),
            ("dividend_yield", "Dividend Yield (%)", "percent"),
            ("payout_ratio", "Payout Ratio (%)", "percent"),
            ("market_cap", "Market Cap", "currency_scaled"),
            ("enterprise_value", "Enterprise Value", "currency_scaled"),
            ("pe", "P/E", "ratio"),
            ("pbv", "P/BV", "ratio"),
            ("ps", "P/S", "ratio"),
            ("ev_ebitda", "EV/EBITDA", "ratio"),
            ("roa", "ROA (%)", "percent"),
            ("roic", "ROIC (%)", "percent"),
            ("interest_coverage", "Interest Coverage", "ratio"),
            ("asset_turnover", "Asset Turnover", "ratio"),
            ("equity_multiplier", "Equity Multiplier", "ratio"),
            ("earnings_yield", "Earnings Yield (%)", "percent"),
            ("fcf_yield", "FCF Yield (%)", "percent"),
            ("price_fcf", "Price / FCF", "ratio"),
            ("ev_sales", "EV / Sales", "ratio"),
            ("ev_fcf", "EV / FCF", "ratio"),
            ("peg_ratio", "PEG Ratio", "ratio"),
            ("beta", "Beta", "ratio"),
            ("shares_outstanding", "Shares Outstanding", "number"),
            ("float_shares", "Float Shares", "number"),
            ("revenue_per_share", "Revenue Per Share", "per_share"),
            ("cash_per_share", "Cash Per Share", "per_share"),
        ],
    },
]


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def safe_percentage(numerator: float | None, denominator: float | None) -> float | None:
    ratio = safe_divide(numerator, denominator)
    return ratio * 100 if ratio is not None else None


def safe_percent(numerator: float | None, denominator: float | None) -> float | None:
    return safe_percentage(numerator, denominator)


def safe_growth_percent(current: float | None, previous: float | None) -> float | None:
    if current is None or previous in (None, 0):
        return None
    return ((current - previous) / previous) * 100


def calculate_payout_ratio(dividend_per_share: float | None, eps: float | None) -> float | None:
    return safe_percent(dividend_per_share, eps)


def _unavailable_cell() -> FinancialCell:
    return FinancialCell(value=None, display="-", status="unavailable")


def _record(normalized: dict[str, Any], period_key: str, field: str) -> dict[str, Any] | None:
    value = normalized.get("periods", {}).get(period_key, {}).get(field)
    return value if isinstance(value, dict) else None


def _number(normalized: dict[str, Any], period_key: str, field: str) -> float | None:
    item = _record(normalized, period_key, field)
    value = item.get("value") if item else None
    return float(value) if isinstance(value, (int, float)) else None


def _amount(value: float | None) -> float | None:
    return abs(value) if value is not None else None


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


def _reported_or_calculated_cell(
    record: dict[str, Any] | None,
    calculated_value: float | None,
    formula: str,
    *,
    format_type: str = "number",
    scale_divisor: float = 1,
    percent_ratio: bool = False,
) -> FinancialCell:
    reported = _reported_cell(
        record,
        format_type=format_type,
        scale_divisor=scale_divisor,
        percent_ratio=percent_ratio,
    )
    if reported.status != "unavailable":
        return reported
    return _calculated_cell(
        calculated_value,
        formula,
        format_type=format_type,
        scale_divisor=scale_divisor,
    )


def _calculated_cell(
    value: float | None,
    formula: str,
    *,
    format_type: str = "number",
    scale_divisor: float = 1,
) -> FinancialCell:
    if value is None:
        return _unavailable_cell()
    display_value = value / scale_divisor if format_type == "currency_scaled" else value
    return FinancialCell(
        value=display_value,
        display=format_financial_value(display_value, format_type),
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
    previous_ebitda = _number(normalized, previous_key, "ebitda")
    gross_profit = _number(normalized, key, "gross_profit")
    cost_of_revenue = _number(normalized, key, "cost_of_revenue")
    operating_income = _number(normalized, key, "operating_income")
    operating_expense = _number(normalized, key, "operating_expense")
    if operating_expense is None and gross_profit is not None and operating_income is not None:
        operating_expense = gross_profit - operating_income
    previous_operating_income = _number(normalized, previous_key, "operating_income")
    effective_ebitda = ebitda if ebitda is not None else operating_income
    net_profit = _number(normalized, key, "net_profit")
    previous_net_profit = _number(normalized, previous_key, "net_profit")
    pretax_income = _number(normalized, key, "pretax_income")
    income_tax_expense = _number(normalized, key, "income_tax_expense")
    interest_expense = _number(normalized, key, "interest_expense")
    total_equity = _number(normalized, key, "total_equity")
    previous_equity = _number(normalized, _previous_equity_period_key(period), "total_equity")
    total_debt = _number(normalized, key, "total_debt")
    cash = _number(normalized, key, "cash")
    current_assets = _number(normalized, key, "current_assets")
    current_liabilities = _number(normalized, key, "current_liabilities")
    total_liabilities = _number(normalized, key, "total_liabilities")
    total_assets = _number(normalized, key, "total_assets")
    inventory = _number(normalized, key, "inventory")
    invested_capital_reported = _number(normalized, key, "invested_capital")
    operating_cash_flow = _number(normalized, key, "operating_cash_flow")
    previous_operating_cash_flow = _number(normalized, previous_key, "operating_cash_flow")
    investing_cash_flow = _number(normalized, key, "investing_cash_flow")
    financing_cash_flow = _number(normalized, key, "financing_cash_flow")
    capex = _amount(_number(normalized, key, "capex"))
    depreciation_amortization = _number(normalized, key, "depreciation_amortization")
    change_in_working_capital = _number(normalized, key, "change_in_working_capital")
    stock_based_compensation = _number(normalized, key, "stock_based_compensation")
    dividend_paid = _amount(_number(normalized, key, "dividend_paid"))
    share_repurchase = _amount(_number(normalized, key, "share_repurchase"))
    shares_outstanding = _number(normalized, key, "shares_outstanding")
    float_shares = _number(normalized, key, "float_shares")
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

    market_cap_from_price = (
        reference_price * shares_outstanding if reference_price is not None and shares_outstanding is not None else None
    )
    market_cap_record = _record(normalized, key, "market_cap")
    market_cap_value = _number(normalized, key, "market_cap") or market_cap_from_price
    enterprise_value_value = _number(normalized, key, "enterprise_value")
    if enterprise_value_value is None and market_cap_value is not None and total_debt is not None and cash is not None:
        enterprise_value_value = market_cap_value + total_debt - cash

    free_cash_flow_value = _number(normalized, key, "free_cash_flow")
    if free_cash_flow_value is None and operating_cash_flow is not None and capex is not None:
        free_cash_flow_value = operating_cash_flow - capex
    previous_free_cash_flow = _number(normalized, previous_key, "free_cash_flow")
    if previous_free_cash_flow is None:
        previous_operating_cash_flow_for_fcf = _number(normalized, previous_key, "operating_cash_flow")
        previous_capex = _amount(_number(normalized, previous_key, "capex"))
        if previous_operating_cash_flow_for_fcf is not None and previous_capex is not None:
            previous_free_cash_flow = previous_operating_cash_flow_for_fcf - previous_capex

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
    payout_ratio_value = calculate_payout_ratio(dividend_per_share, eps_value)
    payout_ratio_formula = "Dividend per Share / EPS * 100"
    if payout_ratio_value is None:
        payout_ratio_value = safe_percent(dividend_paid, net_profit)
        payout_ratio_formula = "Dividend Paid / Net Income * 100"
    payout_ratio_cell = _reported_or_calculated_cell(
        _record(normalized, key, "payout_ratio"),
        payout_ratio_value,
        payout_ratio_formula,
        format_type="percent",
        percent_ratio=True,
    )

    net_debt_value = total_debt - cash if total_debt is not None and cash is not None else _number(normalized, key, "net_debt")
    working_capital_value = (
        current_assets - current_liabilities
        if current_assets is not None and current_liabilities is not None
        else _number(normalized, key, "working_capital")
    )
    invested_capital_value = invested_capital_reported
    if invested_capital_value is None and total_debt is not None and total_equity is not None and cash is not None:
        invested_capital_value = total_debt + total_equity - cash
    nopat = operating_income * (1 - safe_divide(income_tax_expense, pretax_income)) if operating_income is not None and safe_divide(income_tax_expense, pretax_income) is not None else None
    der = safe_divide(total_debt, total_equity)
    fcf_coverage = safe_divide(free_cash_flow_value, dividend_paid)
    current_ratio_value = _number(normalized, key, "current_ratio")
    if current_ratio_value is None:
        current_ratio_value = safe_divide(current_assets, current_liabilities)
    quick_ratio_value = _number(normalized, key, "quick_ratio")
    if quick_ratio_value is None and current_assets is not None and current_liabilities is not None:
        quick_ratio_value = safe_divide(current_assets - (inventory or 0), current_liabilities)
    revenue_per_share_value = _number(normalized, key, "revenue_per_share")
    if revenue_per_share_value is None:
        revenue_per_share_value = safe_divide(revenue, shares_outstanding)

    cells = {
        "revenue": _reported_cell(_record(normalized, key, "revenue"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "ebitda": _reported_cell(_record(normalized, key, "ebitda"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "net_profit": _reported_cell(_record(normalized, key, "net_profit"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "revenue_growth": _calculated_cell(safe_growth_percent(revenue, previous_revenue), "(Revenue current - Revenue previous) / Revenue previous * 100", format_type="percent"),
        "net_profit_growth": _calculated_cell(safe_growth_percent(net_profit, previous_net_profit), "(Net Profit current - Net Profit previous) / Net Profit previous * 100", format_type="percent"),
        "ebitda_margin": _calculated_cell(safe_percent(ebitda, revenue), "EBITDA / Revenue * 100", format_type="percent"),
        "net_profit_margin": _calculated_cell(safe_percent(net_profit, revenue), "Net Profit / Revenue * 100", format_type="percent"),
        "eps": eps_cell,
        "gross_profit": _reported_cell(_record(normalized, key, "gross_profit"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "cost_of_revenue": _reported_cell(_record(normalized, key, "cost_of_revenue"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "operating_income": _reported_cell(_record(normalized, key, "operating_income"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "operating_expense": _reported_or_calculated_cell(_record(normalized, key, "operating_expense"), operating_expense, "Gross Profit - Operating Income", format_type="currency_scaled", scale_divisor=scale_divisor),
        "pretax_income": _reported_cell(_record(normalized, key, "pretax_income"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "income_tax_expense": _reported_cell(_record(normalized, key, "income_tax_expense"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "interest_expense": _reported_cell(_record(normalized, key, "interest_expense"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "ebitda_growth": _calculated_cell(safe_growth_percent(ebitda, previous_ebitda), "(EBITDA current - EBITDA previous) / EBITDA previous * 100", format_type="percent"),
        "operating_income_growth": _calculated_cell(safe_growth_percent(operating_income, previous_operating_income), "(Operating Income current - Operating Income previous) / Operating Income previous * 100", format_type="percent"),
        "gross_margin": _calculated_cell(safe_percent(gross_profit, revenue), "Gross Profit / Revenue * 100", format_type="percent"),
        "operating_margin": _calculated_cell(safe_percent(operating_income, revenue), "Operating Income / Revenue * 100", format_type="percent"),
        "tax_rate": _calculated_cell(safe_percent(income_tax_expense, pretax_income), "Income Tax Expense / Pretax Income * 100", format_type="percent"),
        "bvps": _reported_or_calculated_cell(_record(normalized, key, "bvps"), safe_divide(total_equity, shares_outstanding), "Total Equity / Shares Outstanding", format_type="per_share"),
        "net_debt": _reported_or_calculated_cell(_record(normalized, key, "net_debt"), net_debt_value, "Total Debt - Cash", format_type="currency_scaled", scale_divisor=scale_divisor),
        "cash_ratio": _calculated_cell(safe_divide(cash, current_liabilities if current_liabilities is not None else total_liabilities), "Cash / Current Liabilities; fallback to Total Liabilities", format_type="ratio"),
        "equity_ratio": _calculated_cell(safe_percent(total_equity, total_assets), "Total Equity / Total Assets * 100", format_type="percent"),
        "total_assets": _reported_cell(_record(normalized, key, "total_assets"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "total_liabilities": _reported_cell(_record(normalized, key, "total_liabilities"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "total_equity": _reported_cell(_record(normalized, key, "total_equity"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "cash": _reported_cell(_record(normalized, key, "cash"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "total_debt": _reported_cell(_record(normalized, key, "total_debt"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "current_assets": _reported_cell(_record(normalized, key, "current_assets"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "current_liabilities": _reported_cell(_record(normalized, key, "current_liabilities"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "working_capital": _reported_or_calculated_cell(_record(normalized, key, "working_capital"), working_capital_value, "Current Assets - Current Liabilities", format_type="currency_scaled", scale_divisor=scale_divisor),
        "invested_capital": _reported_or_calculated_cell(_record(normalized, key, "invested_capital"), invested_capital_value, "Total Debt + Total Equity - Cash", format_type="currency_scaled", scale_divisor=scale_divisor),
        "net_debt_to_equity": _calculated_cell(safe_divide(net_debt_value, total_equity), "Net Debt / Total Equity", format_type="ratio"),
        "current_ratio": _reported_or_calculated_cell(_record(normalized, key, "current_ratio"), current_ratio_value, "Current Assets / Current Liabilities", format_type="ratio"),
        "quick_ratio": _reported_or_calculated_cell(_record(normalized, key, "quick_ratio"), quick_ratio_value, "(Current Assets - Inventory) / Current Liabilities", format_type="ratio"),
        "debt_ratio": _calculated_cell(safe_divide(total_debt, total_assets), "Total Debt / Total Assets", format_type="ratio"),
        "free_cash_flow": _reported_or_calculated_cell(_record(normalized, key, "free_cash_flow"), free_cash_flow_value, "Operating Cash Flow - abs(Capex)", format_type="currency_scaled", scale_divisor=scale_divisor),
        "cfo_to_net_income": _calculated_cell(safe_divide(operating_cash_flow, net_profit), "Operating Cash Flow / Net Income", format_type="ratio"),
        "capex_intensity_percent": _calculated_cell(safe_percent(capex, revenue), "Capex / Revenue * 100", format_type="percent"),
        "fcf_coverage": _calculated_cell(fcf_coverage, "Free Cash Flow / Dividend Paid", format_type="ratio"),
        "operating_cash_flow": _reported_cell(_record(normalized, key, "operating_cash_flow"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "investing_cash_flow": _reported_cell(_record(normalized, key, "investing_cash_flow"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "financing_cash_flow": _reported_cell(_record(normalized, key, "financing_cash_flow"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "capital_expenditure": _reported_or_calculated_cell(_record(normalized, key, "capex"), capex, "Capital Expenditure", format_type="currency_scaled", scale_divisor=scale_divisor),
        "depreciation_amortization": _reported_cell(_record(normalized, key, "depreciation_amortization"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "change_in_working_capital": _reported_cell(_record(normalized, key, "change_in_working_capital"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "stock_based_compensation": _reported_cell(_record(normalized, key, "stock_based_compensation"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "cash_dividends_paid": _reported_cell(_record(normalized, key, "dividend_paid"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "share_repurchase": _reported_cell(_record(normalized, key, "share_repurchase"), format_type="currency_scaled", scale_divisor=scale_divisor),
        "fcf_margin": _calculated_cell(safe_percent(free_cash_flow_value, revenue), "Free Cash Flow / Revenue * 100", format_type="percent"),
        "fcf_growth": _calculated_cell(safe_growth_percent(free_cash_flow_value, previous_free_cash_flow), "(FCF current - FCF previous) / FCF previous * 100", format_type="percent"),
        "cfo_growth": _calculated_cell(safe_growth_percent(operating_cash_flow, previous_operating_cash_flow), "(Operating Cash Flow current - Operating Cash Flow previous) / Operating Cash Flow previous * 100", format_type="percent"),
        "dividend_coverage_by_fcf": _calculated_cell(safe_divide(free_cash_flow_value, dividend_paid), "Free Cash Flow / Cash Dividends Paid", format_type="ratio"),
        "roe": _reported_or_calculated_cell(
            _record(normalized, key, "roe"),
            safe_percent(net_profit, average_equity if average_equity is not None else total_equity),
            "Net Profit / Average Equity * 100; fallback to Total Equity when average is unavailable",
            format_type="percent",
            percent_ratio=True,
        ),
        "der": _calculated_cell(der, "Total Debt / Total Equity", format_type="ratio"),
        "debt_to_ebitda": _calculated_cell(safe_divide(total_debt, effective_ebitda), "Total Debt / EBITDA; fallback to Operating Income when EBITDA is unavailable", format_type="ratio"),
        "dividend_yield": dividend_yield_cell,
        "payout_ratio": payout_ratio_cell,
        "market_cap": _reported_or_calculated_cell(market_cap_record, market_cap_from_price, "Reference Price * Shares Outstanding", format_type="currency_scaled", scale_divisor=scale_divisor),
        "enterprise_value": _reported_or_calculated_cell(_record(normalized, key, "enterprise_value"), enterprise_value_value, "Market Cap + Total Debt - Cash", format_type="currency_scaled", scale_divisor=scale_divisor),
        "pe": _reported_or_calculated_cell(_record(normalized, key, "pe"), safe_divide(market_cap_value, net_profit), "Market Cap / Net Profit", format_type="ratio"),
        "pbv": _reported_or_calculated_cell(_record(normalized, key, "pbv"), safe_divide(market_cap_value, total_equity), "Market Cap / Total Equity", format_type="ratio"),
        "ps": _reported_or_calculated_cell(_record(normalized, key, "ps"), safe_divide(market_cap_value, revenue), "Market Cap / Revenue", format_type="ratio"),
        "ev_ebitda": _reported_or_calculated_cell(_record(normalized, key, "ev_ebitda"), safe_divide(enterprise_value_value, effective_ebitda), "Enterprise Value / EBITDA; fallback to Operating Income when EBITDA is unavailable", format_type="ratio"),
        "roa": _reported_or_calculated_cell(
            _record(normalized, key, "roa"),
            safe_percent(net_profit, total_assets),
            "Net Income / Total Assets * 100",
            format_type="percent",
            percent_ratio=True,
        ),
        "roic": _calculated_cell(safe_percent(nopat, invested_capital_value), "NOPAT / Invested Capital * 100", format_type="percent"),
        "interest_coverage": _calculated_cell(safe_divide(operating_income, interest_expense), "EBIT / Interest Expense", format_type="ratio"),
        "asset_turnover": _calculated_cell(safe_divide(revenue, total_assets), "Revenue / Total Assets", format_type="ratio"),
        "equity_multiplier": _calculated_cell(safe_divide(total_assets, total_equity), "Total Assets / Total Equity", format_type="ratio"),
        "earnings_yield": _reported_or_calculated_cell(
            _record(normalized, key, "earnings_yield"),
            safe_percent(eps_value, reference_price)
            or (safe_divide(100, _number(normalized, key, "pe")) if _number(normalized, key, "pe") else None),
            "EPS / Price * 100; fallback to 1 / P/E * 100",
            format_type="percent",
            percent_ratio=True,
        ),
        "fcf_yield": _reported_or_calculated_cell(
            _record(normalized, key, "fcf_yield"),
            safe_percent(free_cash_flow_value, market_cap_value),
            "Free Cash Flow / Market Cap * 100",
            format_type="percent",
            percent_ratio=True,
        ),
        "price_fcf": _reported_or_calculated_cell(
            _record(normalized, key, "price_fcf"),
            safe_divide(market_cap_value, free_cash_flow_value),
            "Market Cap / Free Cash Flow",
            format_type="ratio",
        ),
        "ev_sales": _reported_or_calculated_cell(
            _record(normalized, key, "ev_sales"),
            safe_divide(enterprise_value_value, revenue),
            "Enterprise Value / Revenue",
            format_type="ratio",
        ),
        "ev_fcf": _reported_or_calculated_cell(
            _record(normalized, key, "ev_fcf"),
            safe_divide(enterprise_value_value, free_cash_flow_value),
            "Enterprise Value / Free Cash Flow",
            format_type="ratio",
        ),
        "peg_ratio": _reported_cell(_record(normalized, key, "peg_ratio"), format_type="ratio"),
        "beta": _reported_cell(_record(normalized, key, "beta"), format_type="ratio"),
        "shares_outstanding": _reported_cell(_record(normalized, key, "shares_outstanding"), format_type="number"),
        "float_shares": _reported_cell(_record(normalized, key, "float_shares"), format_type="number"),
        "revenue_per_share": _reported_or_calculated_cell(_record(normalized, key, "revenue_per_share"), revenue_per_share_value, "Revenue / Shares Outstanding", format_type="per_share"),
        "cash_per_share": _reported_or_calculated_cell(
            _record(normalized, key, "cash_per_share"),
            safe_divide(cash, shares_outstanding),
            "Cash & Cash Equivalents / Shares Outstanding",
            format_type="per_share",
        ),
        "balance_der": _calculated_cell(der, "Total Debt / Total Equity", format_type="ratio"),
        "dividend_yield_percent": dividend_yield_cell,
        "payout_ratio_percent": payout_ratio_cell,
    }
    return cells


def build_metric_rows(
    *,
    periods: list[FinancialPeriod],
    normalized: dict[str, Any],
    include_operating_expense: bool = False,
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
        section_row_definitions = list(section_definition["rows"])
        if include_operating_expense and section_definition["key"] == "income":
            insert_at = next(
                (index + 1 for index, row in enumerate(section_row_definitions) if row[0] == "operating_income"),
                len(section_row_definitions),
            )
            section_row_definitions.insert(
                insert_at,
                ("operating_expense", "Operating Expense", "currency_scaled"),
            )
        section_rows = []
        for key, label, format_type in section_row_definitions:
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
