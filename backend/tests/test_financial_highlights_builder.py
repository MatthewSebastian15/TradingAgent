from __future__ import annotations

import json

import pytest
from tradingagents.financial_highlights.builder import build_financial_highlights
from tradingagents.financial_highlights.models import to_dict
from tradingagents.financial_highlights.period_resolver import resolve_financial_highlight_periods
from tradingagents.financial_highlights.statement_parser import (
    _canonical_field,
    parse_vendor_financials,
)


def _vendor_payloads():
    return {
        "yfinance": {
            "income_statement": {
                "FY22": {
                    "revenue": 100_000_000_000,
                    "ebitda": 20_000_000_000,
                    "net_profit": 10_000_000_000,
                },
                "FY23": {
                    "revenue": 120_000_000_000,
                    "ebitda": 24_000_000_000,
                    "net_profit": 12_000_000_000,
                },
                "FY24": {
                    "revenue": 132_000_000_000,
                    "ebitda": 27_000_000_000,
                    "net_profit": 13_000_000_000,
                },
                "FY25": {
                    "revenue": 150_000_000_000,
                    "ebitda": 30_000_000_000,
                    "net_profit": 15_000_000_000,
                },
                "FY25Q1": {
                    "revenue": 35_000_000_000,
                    "ebitda": 7_000_000_000,
                    "net_profit": 3_500_000_000,
                },
                "FY26Q1": {
                    "revenue": 40_000_000_000,
                    "ebitda": 8_000_000_000,
                    "net_profit": 4_000_000_000,
                },
            },
            "balance_sheet": {
                "FY22": {
                    "total_equity": 50_000_000_000,
                    "total_debt": 10_000_000_000,
                    "shares_outstanding": 1_000_000_000,
                },
                "FY23": {
                    "total_equity": 55_000_000_000,
                    "total_debt": 11_000_000_000,
                    "shares_outstanding": 1_000_000_000,
                },
                "FY24": {
                    "total_equity": 60_000_000_000,
                    "total_debt": 12_000_000_000,
                    "shares_outstanding": 1_000_000_000,
                },
                "FY25": {
                    "total_equity": 66_000_000_000,
                    "total_debt": 13_200_000_000,
                    "shares_outstanding": 1_000_000_000,
                },
                "FY25Q1": {
                    "total_equity": 62_000_000_000,
                    "total_debt": 12_400_000_000,
                    "shares_outstanding": 1_000_000_000,
                },
                "FY26Q1": {
                    "total_equity": 70_000_000_000,
                    "total_debt": 14_000_000_000,
                    "shares_outstanding": 1_000_000_000,
                },
            },
            "dividends": {
                "FY26Q1": {"dividend_per_share": 2.0, "reference_price": 100.0},
            },
        }
    }


def _rows(payload):
    return {row.key: row for row in payload.rows}


def test_builder_returns_all_rows_and_dynamic_periods():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-05-15",
        vendor_payloads=_vendor_payloads(),
    )

    assert [period.key for period in highlights.periods] == ["FY23", "FY24", "FY25", "FY26Q1"]
    assert [row.key for row in highlights.rows] == [
        "revenue",
        "ebitda",
        "net_profit",
        "revenue_growth",
        "net_profit_growth",
        "ebitda_margin",
        "net_profit_margin",
        "eps",
        "gross_profit",
        "cost_of_revenue",
        "operating_income",
        "pretax_income",
        "income_tax_expense",
        "interest_expense",
        "ebitda_growth",
        "operating_income_growth",
        "gross_margin",
        "operating_margin",
        "tax_rate",
        "bvps",
        "net_debt",
        "cash_ratio",
        "equity_ratio",
        "total_assets",
        "total_liabilities",
        "total_equity",
        "cash",
        "total_debt",
        "current_assets",
        "current_liabilities",
        "working_capital",
        "invested_capital",
        "net_debt_to_equity",
        "current_ratio",
        "quick_ratio",
        "debt_ratio",
        "free_cash_flow",
        "cfo_to_net_income",
        "capex_intensity_percent",
        "fcf_coverage",
        "operating_cash_flow",
        "investing_cash_flow",
        "financing_cash_flow",
        "capital_expenditure",
        "depreciation_amortization",
        "change_in_working_capital",
        "stock_based_compensation",
        "cash_dividends_paid",
        "share_repurchase",
        "fcf_margin",
        "fcf_growth",
        "cfo_growth",
        "dividend_coverage_by_fcf",
        "roe",
        "der",
        "debt_to_ebitda",
        "dividend_yield",
        "payout_ratio",
        "market_cap",
        "enterprise_value",
        "pe",
        "pbv",
        "ps",
        "ev_ebitda",
        "roa",
        "roic",
        "interest_coverage",
        "asset_turnover",
        "equity_multiplier",
        "earnings_yield",
        "fcf_yield",
        "price_fcf",
        "ev_sales",
        "ev_fcf",
        "peg_ratio",
        "beta",
        "shares_outstanding",
        "float_shares",
        "revenue_per_share",
        "cash_per_share",
    ]
    assert [section.title for section in highlights.sections] == [
        "Income",
        "Balance Sheet",
        "Cash Flow",
        "Ratios",
    ]
    assert [len(section.rows) for section in highlights.sections] == [19, 17, 17, 27]

    assert highlights.period_logic == "fy23_to_analysis_quarter"
    revenue_rows = [row for row in highlights.rows if row.key == "revenue"]
    assert len(revenue_rows) == 1
    assert set(revenue_rows[0].values.keys()) == {"FY23", "FY24", "FY25", "FY26Q1"}


def test_builder_marks_reported_calculated_and_unavailable_cells():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-05-15",
        vendor_payloads=_vendor_payloads(),
    )
    rows = _rows(highlights)

    assert rows["revenue"].values["FY23"].status == "reported"
    assert rows["revenue"].values["FY23"].display == "120,000.0"
    assert rows["revenue_growth"].values["FY23"].status == "calculated"
    assert rows["revenue_growth"].values["FY23"].value == 20.0
    assert rows["revenue_growth"].values["FY23"].display == "20.00%"
    assert rows["eps"].values["FY23"].status == "calculated"
    assert rows["roe"].values["FY26Q1"].value == 5.88235294117647
    assert rows["dividend_yield"].values["FY23"].status == "unavailable"
    assert rows["dividend_yield"].values["FY23"].display == "-"
    assert rows["dividend_yield"].values["FY26Q1"].value == 2.0
    assert rows["der"].values["FY23"].display == "0.20x"
    assert rows["payout_ratio"].values["FY26Q1"].display == "50.00%"
    assert highlights.data_quality["status"] == "partial"


def test_builder_does_not_crash_when_vendor_payloads_are_missing():
    payload = to_dict(build_financial_highlights(ticker="TEST", analysis_date="2026-01-15"))

    assert payload is not None
    assert len(payload["rows"]) == 80
    assert len(payload["sections"]) == 4
    assert payload["data_quality"]["status"] == "unavailable"
    assert all(cell["display"] == "-" for row in payload["rows"] for cell in row["values"].values())


def test_builder_parses_annual_and_quarterly_yfinance_statement_bundle():
    statements = "\n\n".join(
        [
            "# Financial statement frequency: annual\n"
            + ",2023-12-31,2024-12-31,2025-12-31\n"
            + "Total Revenue,120000000000,132000000000,150000000000",
            "# Financial statement frequency: quarterly\n,2026-03-31\nTotal Revenue,40000000000",
        ]
    )

    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-05-15",
        income_statement=statements,
    )
    rows = _rows(highlights)

    assert rows["revenue"].values["FY23"].value == 120_000.0
    assert rows["revenue"].values["FY26Q1"].value == 40_000.0


def test_statement_parser_uses_vendor_priority_for_duplicate_values():
    normalized = parse_vendor_financials(
        ticker="TEST",
        periods=resolve_financial_highlight_periods("2026-01-15"),
        vendor_payloads={
            "yfinance": {"income_statement": {"FY25": {"revenue": 150_000_000_000}}},
            "alpha_vantage": {"income_statement": {"FY25": {"revenue": 999_000_000_000}}},
        },
    )

    assert normalized["periods"]["FY25"]["revenue"]["value"] == 150_000_000_000
    assert normalized["periods"]["FY25"]["revenue"]["source_vendor"] == "yfinance"


def test_statement_parser_sets_currency_from_ticker_market():
    idr = parse_vendor_financials(ticker="BBCA.JK", periods=[])
    usd = parse_vendor_financials(ticker="AAPL", periods=[])

    assert idr["currency"] == "IDR"
    assert usd["currency"] == "USD"


def test_builder_parses_alpha_vantage_statement_payload():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-05-15",
        income_statement=json.dumps(
            {
                "annualReports": [
                    {"fiscalDateEnding": "2025-12-31", "totalRevenue": "150000000000"},
                ],
                "quarterlyReports": [
                    {"fiscalDateEnding": "2026-03-31", "totalRevenue": "40000000000"},
                ],
            }
        ),
    )
    rows = _rows(highlights)

    assert rows["revenue"].values["FY25"].value == 150_000.0
    assert rows["revenue"].values["FY26Q1"].value == 40_000.0


def test_builder_parses_finnhub_reported_statement_payload():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-05-15",
        income_statement=json.dumps(
            {
                "source": "finnhub",
                "reports": [
                    {
                        "endDate": "2026-03-31",
                        "quarter": 1,
                        "report": {
                            "ic": [
                                {
                                    "concept": "us-gaap_Revenues",
                                    "label": "Revenue",
                                    "value": 40_000_000_000,
                                }
                            ]
                        },
                    }
                ],
            }
        ),
    )
    rows = _rows(highlights)

    assert rows["revenue"].values["FY26Q1"].value == 40_000.0


def test_builder_uses_idr_billion_and_point_in_time_market_cap():
    highlights = build_financial_highlights(
        ticker="BBCA.JK",
        analysis_date="2026-01-15",
        vendor_payloads=_vendor_payloads(),
        company_profile={
            "market_cap": 1_205_000_000_000_000,
            "data_quality": {"field_sources": {"market_cap": "yfinance"}},
        },
    )

    rows = _rows(highlights)
    assert highlights.scale_label == "IDR Bn"
    assert rows["revenue"].unit == "IDR Bn"
    assert rows["revenue"].values["FY23"].value == 120.0
    assert highlights.point_in_time[0].display == "1,205,000.0"
    assert highlights.point_in_time[0].unit == "IDR Bn"


def test_statement_parser_limits_suffix_aliases_to_xbrl_concepts():
    assert _canonical_field("Cost Of Revenue") == "cost_of_revenue"
    assert _canonical_field("us-gaap_Revenues") == "revenue"


def test_builder_respects_direct_source_units_without_double_conversion():
    highlights = build_financial_highlights(
        ticker="BBCA.JK",
        analysis_date="2026-01-15",
        vendor_payloads={
            "yfinance": {
                "income_statement": {
                    "FY25": {
                        "revenue": {
                            "value": 150_000,
                            "source_unit": "million",
                        }
                    }
                }
            }
        },
    )

    assert _rows(highlights)["revenue"].values["FY25"].value == 150.0


def test_builder_uses_last_close_on_or_before_analysis_date_for_dividend_yield():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-01-15",
        dividends={"FY25": {"dividend_per_share": 1}},
        price_data=(
            "Date,Open,High,Low,Close,Volume\n2025-12-31,9,11,8,10,100\n2026-01-14,18,22,17,20,200"
        ),
    )

    assert _rows(highlights)["dividend_yield"].values["FY25"].value == 10


def test_builder_preserves_reported_zero_eps():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-01-15",
        vendor_payloads={
            "yfinance": {
                "income_statement": {"FY25": {"net_profit": 100, "eps": 0}},
                "balance_sheet": {"FY25": {"shares_outstanding": 100}},
            }
        },
    )
    eps = _rows(highlights)["eps"].values["FY25"]

    assert eps.value == 0
    assert eps.status == "reported"


def test_statement_parser_reads_expanded_yfinance_aliases_and_profile_shares():
    normalized = parse_vendor_financials(
        ticker="TEST",
        periods=resolve_financial_highlight_periods("2026-01-15"),
        income_statement=(
            "# Financial statement frequency: annual\n"
            + ",2025-12-31\n"
            + "Operating Revenue,1000\n"
            + "Net Income Continuous Operations,100\n"
            + "Reported EPS,2"
        ),
        balance_sheet=(
            "# Financial statement frequency: annual\n"
            + ",2025-12-31\n"
            + "Total Equity Gross Minority Interest,500\n"
            + "Long Term Debt And Capital Lease Obligation,200\n"
            + "Cash Financial,80\n"
            + "Total Current Liabilities,100\n"
            + "Common Stock Shares Outstanding,50"
        ),
        cashflow=(
            "# Financial statement frequency: annual\n"
            + ",2025-12-31\n"
            + "Total Cash From Operating Activities,160\n"
            + "Cash Dividends Paid Direct,-30"
        ),
    )
    period = normalized["periods"]["FY25"]

    assert period["revenue"]["value"] == 1000
    assert period["net_profit"]["value"] == 100
    assert period["eps"]["value"] == 2
    assert period["total_equity"]["value"] == 500
    assert period["total_debt"]["value"] == 200
    assert period["cash"]["value"] == 80
    assert period["current_liabilities"]["value"] == 100
    assert period["operating_cash_flow"]["value"] == 160
    assert period["dividend_paid"]["value"] == 30


def test_builder_maps_dividend_series_and_reference_prices_per_period():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-05-15",
        dividends={
            "2023-02-01": 1.0,
            "2023-08-01": 2.0,
            "2026-03-01": 1.5,
        },
        price_data=("Date,Close\n2023-12-29,30\n2025-12-31,50\n2026-03-28,55\n2026-04-01,99"),
    )
    rows = _rows(highlights)

    assert rows["dividend_yield"].values["FY23"].value == 10
    assert rows["dividend_yield"].values["FY26Q1"].value == pytest.approx(1.5 / 55 * 100)
    assert rows["dividend_yield"].values["FY25"].status == "unavailable"


def test_builder_uses_payout_ratio_fallback_from_dividend_paid_and_net_profit():
    highlights = build_financial_highlights(
        ticker="TEST",
        analysis_date="2026-01-15",
        vendor_payloads={
            "yfinance": {
                "income_statement": {"FY25": {"net_profit": 100}},
                "cashflow": {"FY25": {"dividend_paid": -25}},
            }
        },
    )

    assert _rows(highlights)["payout_ratio"].values["FY25"].value == 25
