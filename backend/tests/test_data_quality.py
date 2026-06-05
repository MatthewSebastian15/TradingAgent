from __future__ import annotations

from tradingagents.dataflows.data_quality import DataQualityReport, build_field_quality


def test_build_field_quality_available_and_missing():
    available = build_field_quality("quote", 100, "yfinance", as_of_date="2026-06-05")
    missing = build_field_quality("market_cap", None, "idx_official", as_of_date="2026-06-05")

    assert available["status"] in {"available", "stale"}
    assert isinstance(available["confidence_score"], int)
    assert missing["status"] == "source_unavailable"
    assert missing["reason"]


def test_data_quality_report_accepts_field_quality():
    report = DataQualityReport(field_quality={"quote": build_field_quality("quote", 1, "yfinance")})
    assert report.field_quality["quote"]["confidence_score"] >= 0
