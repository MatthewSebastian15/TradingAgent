from __future__ import annotations

from tradingagents.dataflows.normalizers import (
    build_financial_highlights_from_normalized_rows,
    normalize_financial_field,
)
from tradingagents.dataflows.period_metadata import build_annual_period_metadata, build_quarter_period_metadata


def test_financial_highlights_built_from_normalized_rows():
    rows = [
        {
            "period": build_annual_period_metadata(2024, currency="IDR"),
            "revenue": normalize_financial_field(100, unit="million", currency="IDR"),
            "net_profit": normalize_financial_field(20, unit="million", currency="IDR"),
            "gross_profit": normalize_financial_field(60, unit="million", currency="IDR"),
            "operating_income": normalize_financial_field(30, unit="million", currency="IDR"),
        }
    ]

    highlights = build_financial_highlights_from_normalized_rows(rows)

    assert highlights["revenue"] == 100_000_000
    assert highlights["net_profit"] == 20_000_000
    assert highlights["period"]["period_label"] == "FY2024"
    assert highlights["normalized_period_rows"] == rows
    assert highlights["source"] == "normalized_financial_rows"

    rows_by_key = {row["key"]: row for row in highlights["rows"]}
    assert rows_by_key["operating_expense"]["values"]["FY24"]["value"] == 0.03
    assert rows_by_key["operating_expense"]["values"]["FY24"]["status"] == "calculated"


def test_financial_highlights_filters_display_periods_and_keeps_canonical_keys():
    rows = [
        {
            "period": build_annual_period_metadata(2022, currency="IDR"),
            "revenue": normalize_financial_field(80, unit="million", currency="IDR"),
        },
        {
            "period": build_annual_period_metadata(2023, currency="IDR"),
            "revenue": normalize_financial_field(100, unit="million", currency="IDR"),
        },
        {
            "period": build_annual_period_metadata(2024, currency="IDR"),
            "revenue": normalize_financial_field(120, unit="million", currency="IDR"),
        },
        {
            "period": build_annual_period_metadata(2025, currency="IDR"),
            "revenue": normalize_financial_field(140, unit="million", currency="IDR"),
        },
        {
            "period": build_quarter_period_metadata(2026, 1, currency="IDR"),
            "revenue": normalize_financial_field(40, unit="million", currency="IDR"),
        },
        {
            "period": build_quarter_period_metadata(2026, 2, currency="IDR"),
            "revenue": normalize_financial_field(50, unit="million", currency="IDR"),
        },
    ]

    highlights = build_financial_highlights_from_normalized_rows(
        rows,
        analysis_date="2026-06-06",
        currency="IDR",
    )

    assert [period["key"] for period in highlights["periods"]] == ["FY23", "FY24", "FY25", "FY26Q1"]
    assert [period["display_period"] for period in highlights["periods"]] == [
        "FY 2023",
        "FY 2024",
        "FY 2025",
        "Q1 2026",
    ]
    assert highlights["currency"] == "IDR"
    assert highlights["scale_label"] == "IDR Bn"
    assert highlights["period"]["period_label"] == "Q1 2026"


def test_financial_highlights_uses_company_profile_ratio_fallbacks():
    rows = [
        {
            "period": build_annual_period_metadata(2025, currency="IDR"),
            "revenue": normalize_financial_field(100, unit="million", currency="IDR"),
            "net_profit": normalize_financial_field(20, unit="million", currency="IDR"),
        }
    ]

    highlights = build_financial_highlights_from_normalized_rows(
        rows,
        analysis_date="2026-01-15",
        currency="IDR",
        company_profile={
            "trailing_pe": 10,
            "price_to_book": 2,
            "enterprise_to_revenue": 1.5,
            "payout_ratio": 0.4,
            "return_on_equity": 0.25,
            "return_on_assets": 0.08,
            "total_cash_per_share": 5,
        },
    )
    rows_by_key = {row["key"]: row for row in highlights["rows"]}

    assert rows_by_key["pe"]["values"]["FY25"]["value"] == 10
    assert rows_by_key["pbv"]["values"]["FY25"]["value"] == 2
    assert rows_by_key["ev_sales"]["values"]["FY25"]["value"] == 1.5
    assert rows_by_key["payout_ratio"]["values"]["FY25"]["value"] == 40
    assert rows_by_key["roe"]["values"]["FY25"]["value"] == 25
    assert rows_by_key["roa"]["values"]["FY25"]["value"] == 8
    assert rows_by_key["cash_per_share"]["values"]["FY25"]["value"] == 5
