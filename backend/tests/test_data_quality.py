from __future__ import annotations

from tradingagents.dataflows.quality.data_quality import DataQualityReport, build_field_quality


def test_build_field_quality_available_and_missing():
    available = build_field_quality("quote", 100, "yfinance", as_of_date="2026-06-05")
    missing = build_field_quality("market_cap", None, "idx_official", as_of_date="2026-06-05")

    assert available["status"] in {"available", "stale"}
    assert isinstance(available["confidence_score"], int)
    assert available["freshness_status"]["status"] in {"fresh", "stale"}
    assert missing["status"] == "source_unavailable"
    assert missing["reason"]
    assert "missing_as_of_date" not in missing["warnings"]


def test_data_quality_report_accepts_field_quality():
    report = DataQualityReport(field_quality={"quote": build_field_quality("quote", 1, "yfinance")})
    assert report.field_quality["quote"]["confidence_score"] >= 0
    assert report.field_quality["quote"]["freshness_status"]["status"] == "unknown"


def test_build_field_quality_conflict_status():
    quality = build_field_quality(
        "last_price",
        value=1000,
        source="yfinance",
        conflict_warnings=["last_price conflict"],
        vendor_values={"yfinance": 1000, "finnhub": 1060},
    )
    assert quality["status"] == "conflict"
    assert quality["vendor_values"]["finnhub"] == 1060
    assert quality["freshness_status"]["status"] == "unknown"
