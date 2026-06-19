from __future__ import annotations

from tradingagents.dataflows.fundamentals.fundamental_calculator import (
    calculate_derived_fundamentals,
    calculate_growth,
    safe_div,
)


def test_safe_div_and_growth_guard_zero():
    assert safe_div(1, 0) is None
    assert calculate_growth(10, 0) is None


def test_derived_fundamentals_status_metadata():
    rows = calculate_derived_fundamentals(
        [
            {"period_end": "2022-12-31", "revenue": 100, "net_profit": 10},
            {
                "period_end": "2023-12-31",
                "revenue": 120,
                "net_profit": 12,
                "operating_cash_flow": 20,
                "capex": 5,
            },
        ]
    )
    assert rows[-1]["revenue_growth_percent"] == 20
    assert rows[-1]["free_cash_flow"] == 15
    assert rows[-1]["derived_metrics"]["free_cash_flow"]["status"] == "calculated"


def test_derived_fundamentals_uses_normalized_values():
    rows = calculate_derived_fundamentals(
        [
            {
                "period": {"period_end": "2023-12-31"},
                "revenue": {"raw_value": 100, "normalized_value": 100_000_000},
                "net_profit": {"raw_value": 10, "normalized_value": 10_000_000},
            },
            {
                "period": {"period_end": "2024-12-31"},
                "revenue": {"raw_value": 200, "normalized_value": 300_000_000},
                "net_profit": {"raw_value": 20, "normalized_value": 30_000_000},
                "operating_cash_flow": {"raw_value": 40, "normalized_value": 40_000_000},
                "capex": {"raw_value": 5, "normalized_value": 5_000_000},
            },
        ]
    )
    assert rows[-1]["revenue_growth_percent"] == 200
    assert rows[-1]["free_cash_flow"] == 35_000_000
