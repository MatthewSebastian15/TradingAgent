from __future__ import annotations

from tradingagents.dataflows.quality.data_quality import build_field_quality
from tradingagents.pipeline.orchestrator import run_cross_vendor_validation


def test_pipeline_validation_marks_price_conflict():
    validation = run_cross_vendor_validation("last_price", {"yfinance": 1000, "finnhub": 1060})

    assert validation["status"] == "conflict"
    assert validation["warnings"]
    assert validation["vendor_values"]["finnhub"] == 1060


def test_pipeline_conflict_can_be_attached_to_field_quality():
    validation = run_cross_vendor_validation("last_price", {"yfinance": 1000, "finnhub": 1060})
    quality = build_field_quality(
        "last_price",
        value=1000,
        source="yfinance",
        conflict_warnings=validation["warnings"],
        vendor_values=validation["vendor_values"],
    )

    assert quality["status"] == "conflict"
    assert quality["vendor_values"]["finnhub"] == 1060
    assert "conflict" in quality["warnings"][0]
