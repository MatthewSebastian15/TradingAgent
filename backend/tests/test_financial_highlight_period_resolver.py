from __future__ import annotations

from tradingagents.financial_highlights.period_resolver import resolve_financial_highlight_periods


def _keys(value: str) -> list[str]:
    return [period.key for period in resolve_financial_highlight_periods(value)]


def test_periods_q1_start_from_fy22_to_previous_fy():
    assert _keys("2026-02-15") == ["FY22", "FY23", "FY24", "FY25"]


def test_periods_q2_include_current_q1():
    assert _keys("2026-06-03") == ["FY22", "FY23", "FY24", "FY25", "FY26Q1"]


def test_periods_q3_include_current_q1_q2():
    assert _keys("2026-08-15") == ["FY22", "FY23", "FY24", "FY25", "FY26Q1", "FY26Q2"]


def test_periods_q4_include_current_q1_q2_q3():
    assert _keys("2026-11-15") == ["FY22", "FY23", "FY24", "FY25", "FY26Q1", "FY26Q2", "FY26Q3"]


def test_periods_next_year_q1_include_completed_previous_fy():
    assert _keys("2027-02-15") == ["FY22", "FY23", "FY24", "FY25", "FY26"]
