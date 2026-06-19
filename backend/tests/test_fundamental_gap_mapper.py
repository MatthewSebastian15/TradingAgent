from __future__ import annotations

from tradingagents.dataflows.fundamentals.fundamental_gap_mapper import map_fundamental_gaps


def test_gap_mapper_excludes_calculated_sma():
    report = map_fundamental_gaps({"technical_entry": {"sma_50": 10, "sma_200": 9}})
    fields = {gap["field"] for gap in report["gaps"]}
    assert "sma_50" not in fields
    assert "dividend_yield" in fields
