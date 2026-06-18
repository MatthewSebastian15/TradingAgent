from __future__ import annotations

import json
from dataclasses import asdict

from tradingagents.dataflows.lineage_builder import (
    DataLineage,
    LLMUsageLineage,
    SymbolDiscoveryLineage,
    VendorLineageItem,
    build_data_lineage,
)


def _sample_analysis_result() -> dict:
    return {
        "ticker": "AAPL",
        "input_ticker": "Apple",
        "market": "US",
        "exchange": "NMS",
        "analysis_created_at": "2026-06-11T10:00:00+07:00",
        "search_metadata": {"source": "yfinance_search", "verified": True},
        "data_sources": {
            "quote": "alpha_vantage:quote",
            "price": "yfinance:last_close",
            "fundamental_profile_metrics": "yfinance:fundamentals",
            "news": "newsdata+google_news_light",
        },
        "field_sources": {
            "quote": {"confidence": "high"},
            "fundamental_profile_metrics": {"confidence": "medium"},
        },
        "data_freshness": {
            "price": {"status": "fresh", "as_of_date": "2026-06-10"},
        },
        "vendor_attempts": {
            "quote": [
                {"vendor": "yfinance", "status": "empty", "reason": "empty quote"},
                {"vendor": "alpha_vantage", "status": "success", "duration_ms": 120},
            ],
            "news": [
                {"vendor": "newsdata", "status": "failed", "reason": "apikey=secret-news-key"},
                {"vendor": "google_news_light", "status": "success", "duration_ms": 50},
            ],
        },
        "request_budget": {
            "used_total_calls": 4,
            "api_key": "secret-budget-key",
            "raw_response_body": '{"do_not":"store"}',
        },
        "vendor_budget": {
            "llm_calls": {
                "used": 3,
                "models": {"quick_think": "quick-model", "deep_think": "deep-model"},
                "agents": {"Market Analyst": {"used": 2}, "Portfolio Manager": {"used": 1}},
            }
        },
        "budget_exhausted": False,
        "data_quality": {"price_data": "ok", "fundamentals": "partial", "raw_payload": "secret"},
        "data_completeness": {"score": 80},
        "validation_summary": {"status": "ok"},
        "fundamental_gap_report": {"estimated_fields": ["market_cap"]},
        "financial_highlights": {
            "rows": [
                {
                    "key": "revenue",
                    "values": {"FY25": {"status": "estimated", "formula": "fallback"}},
                },
            ]
        },
        "warnings": ["Fallback vendor used."],
    }


def test_data_lineage_dataclasses_are_available():
    assert DataLineage
    assert SymbolDiscoveryLineage
    assert VendorLineageItem
    assert LLMUsageLineage
    assert build_data_lineage


def test_build_data_lineage_records_safe_audit_metadata():
    lineage = build_data_lineage(_sample_analysis_result())

    assert lineage.symbol == "AAPL"
    assert lineage.symbol_discovery.input_symbol == "Apple"
    assert lineage.symbol_discovery.canonical_symbol == "AAPL"
    assert lineage.symbol_discovery.source == "yfinance_search"
    assert lineage.symbol_discovery.verified is True

    quote = next(item for item in lineage.market_data if item.field == "quote")
    assert quote.source == "alpha_vantage:quote"
    assert quote.status == "success"
    assert quote.fallback_from == "yfinance"
    assert quote.fallback_reason == "empty quote"

    news = next(item for item in lineage.news_data if item.field == "news")
    assert news.fallback_from == "newsdata"
    assert news.fallback_reason == "apikey=[REDACTED]"

    assert lineage.llm_usage.quick_model == "quick-model"
    assert lineage.llm_usage.deep_model == "deep-model"
    assert lineage.llm_usage.quick_calls == 2
    assert lineage.llm_usage.deep_calls == 1
    assert lineage.llm_usage.budget_exceeded is False
    assert lineage.budget_summary["request_budget"]["used_total_calls"] == 4
    assert "market_cap" in lineage.estimated_fields
    assert "revenue" in lineage.estimated_fields
    assert lineage.warnings == ["Fallback vendor used."]


def test_build_data_lineage_does_not_leak_api_keys_or_raw_bodies():
    dumped = json.dumps(asdict(build_data_lineage(_sample_analysis_result())))

    assert "secret-news-key" not in dumped
    assert "secret-budget-key" not in dumped
    assert "do_not" not in dumped
    assert "raw_response_body" not in dumped
    assert "raw_payload" not in dumped
