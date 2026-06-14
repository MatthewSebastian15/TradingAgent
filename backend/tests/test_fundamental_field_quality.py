from __future__ import annotations

from tradingagents.dataflows.financial_rows import FinancialRow
from tradingagents.dataflows.fundamental_calculator import (
    build_fundamental_field_quality,
    calculate_market_aware_metrics,
)
from tradingagents.dataflows.fundamental_gap_mapper import estimate_financial_row_fields

from routes.serializers import parse_final_result, shape_result


def test_field_quality_marks_primary_fallback_estimated_and_unavailable_fields():
    row = FinancialRow(
        symbol="AAPL",
        period="FY2024",
        period_type="annual",
        currency="USD",
        unit="raw",
        revenue=100,
        eps=2,
        shares_outstanding=10,
        total_assets=100,
        total_liabilities=40,
        total_debt=20,
        source="yfinance",
        source_confidence="high",
        as_of_date="2024-12-31",
    )
    estimated_row, gap_report = estimate_financial_row_fields(row, fallback_fields=["enterprise_value"])
    metrics = calculate_market_aware_metrics([estimated_row], market="US")
    quality = build_fundamental_field_quality(
        estimated_row,
        metrics,
        fallback_fields=["enterprise_value"],
        estimation_methods=gap_report.estimation_methods,
        unavailable_reasons={"interest_coverage": "missing_interest_expense"},
    )

    assert quality["revenue"]["source"] == "yfinance"
    assert quality["revenue"]["fallback"] is False
    assert quality["net_profit"]["estimated"] is True
    assert quality["net_profit"]["confidence"] != "high"
    assert quality["interest_coverage"]["unavailable_reason"] == "missing_interest_expense"
    assert gap_report.missing_fields
    assert "net_profit" in gap_report.estimated_fields


def test_serializer_exposes_quality_sector_gap_and_metadata_without_breaking_legacy_fields():
    field_quality = {
        "revenue": {"source": "yfinance", "confidence": "high", "estimated": False, "fallback": False},
        "enterprise_value": {
            "source": "finnhub",
            "confidence": "medium",
            "estimated": False,
            "fallback": True,
            "fallback_source": "finnhub",
        },
        "equity": {
            "source": "estimated",
            "confidence": "low",
            "estimated": True,
            "fallback": False,
            "estimation_method": "total_assets - total_liabilities",
        },
    }
    final_state = {
        "financial_highlights": {"revenue": 100, "net_profit": 10},
        "fundamental_field_quality": field_quality,
        "sector_classification": {"sector": "bank", "source": "yfinance", "confidence": "medium"},
        "metrics_profile": "bank",
        "included_metrics": ["roe", "roa"],
        "excluded_metrics": ["interest_coverage"],
        "gap_report": {"missing_fields": ["interest_coverage"], "estimated_fields": ["equity"]},
        "source_metadata": {"source_priority": ["yfinance", "finnhub"]},
        "fallback_metadata": {"fallback_used": True, "fallback_source": "finnhub"},
    }

    parsed = parse_final_result("", None, None, final_state)
    shaped = shape_result({"decision": "Hold", **parsed}, "summary")

    assert parsed["financial_highlights"]["revenue"] == 100
    assert parsed["fundamental_field_quality"]["revenue"]["source"] == "yfinance"
    assert parsed["fundamental_field_quality"]["enterprise_value"]["fallback"] is True
    assert parsed["sector_classification"]["sector"] == "bank"
    assert parsed["metrics_profile"] == "bank"
    assert parsed["included_metrics"] == ["roe", "roa"]
    assert parsed["excluded_metrics"] == ["interest_coverage"]
    assert parsed["gap_report"]["missing_fields"] == ["interest_coverage"]
    assert parsed["fallback_metadata"]["fallback_used"] is True
    assert shaped["fundamental_field_quality"] == field_quality


def test_quality_sources_have_no_removed_provider():
    forbidden = "fm" + "p"
    quality = {
        "revenue": {"source": "yfinance"},
        "enterprise_value": {"source": "finnhub", "fallback": True},
        "equity": {"source": "estimated", "confidence": "low"},
    }
    assert all(forbidden not in str(item.get("source", "")).lower() for item in quality.values())
