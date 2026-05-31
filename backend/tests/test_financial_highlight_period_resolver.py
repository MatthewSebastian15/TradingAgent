from __future__ import annotations

from tradingagents.financial_highlights.period_resolver import resolve_financial_highlight_periods


def _keys(value: str) -> list[str]:
    return [period.key for period in resolve_financial_highlight_periods(value)]


def test_q1_2026_periods():
    assert _keys("2026-01-15") == ["FY22", "FY23", "FY24", "FY25"]


def test_q2_2026_periods():
    assert _keys("2026-05-15") == ["FY23", "FY24", "FY25", "FY26Q1"]


def test_q3_2026_periods():
    assert _keys("2026-08-15") == ["FY23", "FY24", "FY25", "FY26Q1", "FY26Q2"]


def test_q4_2025_periods():
    assert _keys("2025-11-15") == ["FY22", "FY23", "FY24", "FY25Q1", "FY25Q2", "FY25Q3"]


def test_q4_2026_periods():
    assert _keys("2026-11-15") == ["FY23", "FY24", "FY25", "FY26Q1", "FY26Q2", "FY26Q3"]
