"""Characterization snapshot for _build_period_cells via build_financial_highlights.

Locks the full (status, value, display) of every metric cell across all periods
for a rich fixture, so refactors of the cell-building logic stay behavior-exact.
Regenerate the fixture only on an intentional output change.
"""

from __future__ import annotations

import json
from pathlib import Path

from tradingagents.financial_highlights.builder import build_financial_highlights

SNAPSHOT = Path(__file__).parent / "fixtures" / "financial_highlights_snapshot.json"

VENDOR_PAYLOADS = {
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
        "dividends": {"FY26Q1": {"dividend_per_share": 2.0, "reference_price": 100.0}},
    }
}


def _snapshot():
    highlights = build_financial_highlights(
        ticker="TEST", analysis_date="2026-05-15", vendor_payloads=VENDOR_PAYLOADS
    )
    return {
        f"{row.key}|{period_key}": [cell.status, cell.value, cell.display]
        for row in highlights.rows
        for period_key, cell in row.values.items()
    }


def test_period_cells_match_golden_snapshot():
    expected = json.loads(SNAPSHOT.read_text())
    assert _snapshot() == expected
