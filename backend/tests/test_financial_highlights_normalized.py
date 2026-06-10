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
        }
    ]

    highlights = build_financial_highlights_from_normalized_rows(rows)

    assert highlights["revenue"] == 100_000_000
    assert highlights["net_profit"] == 20_000_000
    assert highlights["period"]["period_label"] == "FY2024"
    assert highlights["normalized_period_rows"] == rows
    assert highlights["source"] == "normalized_financial_rows"


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
