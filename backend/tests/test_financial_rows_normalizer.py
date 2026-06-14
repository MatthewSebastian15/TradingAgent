from __future__ import annotations

import tradingagents.dataflows.normalizers as normalizers
from tradingagents.dataflows.financial_rows import FinancialRow, build_period_label, normalize_currency, normalize_unit
from tradingagents.dataflows.normalizers import (
    merge_financial_rows_yfinance_first,
    normalize_finnhub_financials,
    normalize_yfinance_financials,
)


def test_financial_row_contract_and_helpers():
    row = FinancialRow(symbol="AAPL", period="FY2024", period_type="annual", currency="USD", unit="raw")
    assert row.net_profit is None
    assert normalize_currency(None, "IDX") == "IDR"
    assert normalize_currency(None, "US") == "USD"
    assert normalize_unit("million") == "millions"
    assert build_period_label("2025-03-31", "quarterly") == "Q1FY2025"


def test_yfinance_normalizer_maps_rows_and_preserves_period_types():
    rows = normalize_yfinance_financials(
        financials={
            "annual": [{"period_label": "FY2024", "period_type": "annual", "revenue": 100, "net_income": 10}],
            "quarterly": [{"period_label": "Q1FY2025", "period_type": "quarterly", "revenue": 30}],
        },
        balance_sheet={"annual": [{"period_label": "FY2024", "total_assets": 200, "total_liabilities": 80}]},
        cashflow={"annual": [{"period_label": "FY2024", "operating_cash_flow": 20, "capex": 5}]},
        info={"symbol": "AAPL", "currency": "USD", "sharesOutstanding": 1000},
    )

    annual = next(row for row in rows if row.period_type == "annual")
    quarterly = next(row for row in rows if row.period_type == "quarterly")
    assert annual.source == "yfinance"
    assert annual.revenue == 100
    assert annual.net_profit == 10
    assert annual.shares_outstanding == 1000
    assert quarterly.revenue == 30


def test_finnhub_normalizer_maps_fallback_rows_and_empty_inputs_are_safe():
    rows = normalize_finnhub_financials(
        {
            "symbol": "AAPL",
            "reports": [
                {
                    "endDate": "2024-12-31",
                    "report": {
                        "ic": [
                            {"concept": "revenue", "value": 100},
                            {"concept": "netIncome", "value": 12},
                        ],
                        "bs": [{"concept": "totalAssets", "value": 250}],
                    },
                }
            ],
        },
        {"currency": "USD", "shareOutstanding": 1000},
    )

    assert normalize_yfinance_financials({}, {}, {}, {"symbol": "AAPL"}) == []
    assert normalize_finnhub_financials({}) == []
    assert rows[0].source == "finnhub"
    assert rows[0].fallback is True
    assert rows[0].net_profit == 12
    assert rows[0].gross_profit is None


def test_yfinance_first_merge_uses_finnhub_only_for_missing_fields():
    yfinance_row = FinancialRow(
        symbol="AAPL",
        period="FY2024",
        period_type="annual",
        currency="USD",
        unit="raw",
        revenue=100,
        net_profit=10,
        source="yfinance",
        source_confidence="high",
    )
    finnhub_row = FinancialRow(
        symbol="AAPL",
        period="FY2024",
        period_type="annual",
        currency="USD",
        unit="raw",
        revenue=999,
        total_debt=40,
        source="finnhub",
        fallback=True,
        fallback_source="finnhub",
    )

    merged = merge_financial_rows_yfinance_first([yfinance_row], [finnhub_row])
    row = merged["rows"][0]
    assert row.revenue == 100
    assert row.total_debt == 40
    assert merged["metadata"]["fallback_used"] is True
    assert "total_debt" in merged["metadata"]["filled_by_fallback"]
    assert merged["field_quality"]["revenue"]["source"] == "yfinance"
    assert merged["field_quality"]["total_debt"]["fallback"] is True


def test_no_third_provider_financial_normalizer_exists():
    forbidden = "normalize_" + "fm" + "p_financials"
    assert not hasattr(normalizers, forbidden)
