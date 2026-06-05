from __future__ import annotations

from tradingagents.dataflows.fundamental_calculator import calculate_derived_fundamentals, calculate_growth, safe_div


def test_safe_div_and_growth_guard_zero():
    assert safe_div(1, 0) is None
    assert calculate_growth(10, 0) is None


def test_derived_fundamentals_status_metadata():
    rows = calculate_derived_fundamentals([
        {"period_end": "2022-12-31", "revenue": 100, "net_profit": 10},
        {"period_end": "2023-12-31", "revenue": 120, "net_profit": 12, "operating_cash_flow": 20, "capex": 5},
    ])
    assert rows[-1]["revenue_growth_percent"] == 20
    assert rows[-1]["free_cash_flow"] == 15
    assert rows[-1]["derived_metrics"]["free_cash_flow"]["status"] == "calculated"
