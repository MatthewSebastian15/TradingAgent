from __future__ import annotations

from tradingagents.dataflows.data_completeness import calculate_completeness


def test_completeness_groups_empty_do_not_crash():
    report = calculate_completeness({})
    assert report["price_data"]["completeness_pct"] == 0
    assert report["overall"]["status"] == "source_unavailable"


def test_completeness_reports_missing_fields():
    report = calculate_completeness({"quote": 1, "historical_price": "rows"})
    assert report["price_data"]["available_fields"] == 2
    assert "market_cap" in report["price_data"]["missing_fields"]
