from __future__ import annotations

from tradingagents.dataflows.normalizers import (
    build_financial_highlights_from_normalized_rows,
    normalize_financial_field,
)
from tradingagents.dataflows.period_metadata import build_annual_period_metadata


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
