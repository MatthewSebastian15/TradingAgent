"""Unit tests for routes/serializers_quality.py."""

from __future__ import annotations

import routes.serializers_analysis  # noqa: F401  (links serializer modules)
from routes.serializers_quality import (
    _clean_data_source_message,
    _complete_risk_engine_data_quality,
    _freshness_status_from_date,
    _period_end_from_label,
    _validation_warning_details,
)


def test_validation_warning_details_from_codes():
    details = _validation_warning_details(["NEWS_PARTIAL", "CURRENT_PRICE_MISSING"])
    assert details[0] == {
        "code": "NEWS_PARTIAL",
        "severity": "warning",
        "message": "Partial news coverage is available.",
        "blocking": False,
    }
    assert details[1]["severity"] == "error"
    assert details[1]["blocking"] is True


def test_validation_warning_details_dedupes_and_handles_dicts():
    details = _validation_warning_details(
        [
            "NEWS_PARTIAL",
            "NEWS_PARTIAL",
            {"code": "CUSTOM", "message": "custom msg", "severity": "info", "blocking": True},
            "",
        ]
    )
    assert [item["code"] for item in details] == ["NEWS_PARTIAL", "CUSTOM"]
    assert details[1] == {
        "code": "CUSTOM",
        "severity": "info",
        "message": "custom msg",
        "blocking": True,
    }


def test_validation_warning_details_non_list_returns_empty():
    assert _validation_warning_details(None) == []
    assert _validation_warning_details("NEWS_PARTIAL") == []


def test_complete_risk_engine_data_quality_fills_status_flags():
    merged = _complete_risk_engine_data_quality(
        {},
        current_price=None,
        trade_plan_valid=False,
        decision_adjusted=True,
    )
    assert merged["price_data"] == "missing"
    assert merged["trade_levels"] == "invalid"
    assert merged["llm_output"] == "downgraded"
    assert merged["volatility_data"] == "missing"
    # missing price + invalid levels surface as warning details
    codes = {item["code"] for item in merged["warning_details"]}
    assert "PRICE_MISSING" in codes
    assert "TRADE_LEVELS_INVALID" in codes


def test_complete_risk_engine_data_quality_ok_path():
    merged = _complete_risk_engine_data_quality(
        {"news": "ok"},
        current_price=100.0,
        trade_plan_valid=True,
        decision_adjusted=False,
        volatility_score=42,
    )
    assert merged["price_data"] == "ok"
    assert merged["trade_levels"] == "ok"
    assert merged["llm_output"] == "ok"
    assert merged["volatility_data"] == "ok"
    assert merged["warning_details"] == []


def test_clean_data_source_message_rewrites_known_noise():
    assert "request budget" in _clean_data_source_message(
        "Vendor X skipped: request budget exceeded"
    )
    assert _clean_data_source_message("totally novel warning") == "totally novel warning"
    assert _clean_data_source_message("") == "Data source warning"


def test_period_end_from_label():
    assert _period_end_from_label("FY24") == "2024-12-31"
    assert _period_end_from_label("FY26Q1") == "2026-03-31"
    assert _period_end_from_label("fy25 q3") == "2025-09-30"
    assert _period_end_from_label("garbage") is None
    assert _period_end_from_label(None) is None


def test_freshness_status_classification():
    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    assert _freshness_status_from_date(now.isoformat()) == "fresh"
    assert _freshness_status_from_date((now - timedelta(days=60)).isoformat()) == "stale"
    assert _freshness_status_from_date((now - timedelta(days=200)).isoformat()) == "outdated"
    assert _freshness_status_from_date("not-a-date") == "unknown"
