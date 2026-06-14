from __future__ import annotations

from tradingagents.dataflows.financial_rows import FinancialRow, detect_sector
from tradingagents.dataflows.fundamental_calculator import calculate_market_aware_metrics, safe_divide
from tradingagents.dataflows.normalizers import merge_financial_rows_yfinance_first


def _row(**overrides):
    base = {
        "symbol": "AAPL",
        "period": "FY2024",
        "period_type": "annual",
        "currency": "USD",
        "unit": "raw",
        "revenue": 120,
        "gross_profit": 60,
        "ebitda": 30,
        "net_profit": 24,
        "interest_expense": 3,
        "total_assets": 300,
        "total_liabilities": 120,
        "equity": 180,
        "current_assets": 90,
        "current_liabilities": 45,
        "operating_cash_flow": 35,
        "capex": 5,
        "source": "yfinance",
        "source_confidence": "high",
        "as_of_date": "2024-12-31",
    }
    base.update(overrides)
    return FinancialRow(**base)


def test_metrics_calculated_from_financial_rows_and_safe_divide_guards_zero():
    metrics = calculate_market_aware_metrics(
        [_row(period="FY2023", revenue=100, net_profit=20, as_of_date="2023-12-31"), _row()],
        market="US",
    )

    assert safe_divide(1, 0) is None
    assert metrics.roe == 24 / 180 * 100
    assert metrics.roa == 24 / 300 * 100
    assert metrics.npm == 20
    assert metrics.gross_margin == 50
    assert metrics.current_ratio == 2
    assert metrics.free_cash_flow == 30
    assert metrics.revenue_growth_yoy == 20


def test_etf_fund_and_crypto_do_not_crash_without_financials():
    for market, asset_type in (("ETF", "ETF"), ("FUND", "FUND"), ("CRYPTO", "CRYPTO")):
        metrics = calculate_market_aware_metrics([], market=market, asset_type=asset_type)
        assert metrics.unavailable_fields
        assert metrics.roe is None


def test_bank_excludes_interest_coverage_and_der():
    sector = detect_sector("BBCA.JK", {"sector": "Financial Services", "industry": "Banks"})
    metrics = calculate_market_aware_metrics([_row(symbol="BBCA.JK", currency="IDR")], market="IDX", sector_classification=sector)
    assert sector["sector"] == "bank"
    assert metrics.interest_coverage is None
    assert "interest_coverage" in metrics.unavailable_fields
    assert metrics.der is None


def test_der_falls_back_to_liabilities_when_total_debt_missing():
    metrics = calculate_market_aware_metrics([_row(total_debt=None)], market="US")
    assert metrics.der == 120 / 180
    assert "der" in metrics.estimated_fields


def test_finnhub_fallback_does_not_overwrite_yfinance_growth_inputs():
    yfinance_rows = [
        _row(period="FY2023", revenue=100, net_profit=10, as_of_date="2023-12-31"),
        _row(revenue=120, net_profit=12),
    ]
    finnhub_rows = [_row(revenue=999, net_profit=999, total_debt=50, source="finnhub", fallback=True)]
    merged = merge_financial_rows_yfinance_first(yfinance_rows, finnhub_rows)
    metrics = calculate_market_aware_metrics(merged["rows"], market="US")

    assert merged["rows"][-1].revenue == 120
    assert metrics.revenue_growth_yoy == 20
