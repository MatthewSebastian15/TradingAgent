from __future__ import annotations

import json

from tradingagents.observability.metrics_collector import MetricsCollector


def test_metrics_collector_records_complete_summary():
    collector = MetricsCollector()

    collector.record_vendor_call("yfinance", "success", 100, "quote")
    collector.record_vendor_call("yfinance", "empty", 300, "quote")
    collector.record_vendor_call("finnhub", "success", 200, "fundamentals")
    collector.record_cache_event("quote", True)
    collector.record_cache_event("quote", False)
    collector.record_llm_call("quick", True, 50)
    collector.record_llm_call("deep", False, 150)
    collector.record_fallback("newsdata", "google_news_light", "news")
    collector.record_partial_result("pipeline_timeout")
    collector.record_warning("DATA_SOURCE_WARNING")

    summary = collector.get_summary()

    assert summary["period"] == "in_memory_current_process"
    assert summary["vendor_stats"]["yfinance"]["calls"] == 2
    assert summary["vendor_stats"]["yfinance"]["success_rate"] == 0.5
    assert summary["vendor_stats"]["yfinance"]["empty_rate"] == 0.5
    assert summary["vendor_stats"]["yfinance"]["avg_latency_ms"] == 200
    assert summary["cache_stats"]["quote"]["hit_ratio"] == 0.5
    assert summary["cache_stats"]["quote"]["miss_count"] == 1
    assert summary["llm_stats"]["quick"]["calls"] == 1
    assert summary["llm_stats"]["quick"]["success_rate"] == 1.0
    assert summary["llm_stats"]["deep"]["calls"] == 1
    assert summary["llm_stats"]["deep"]["success_rate"] == 0.0
    assert summary["fallback_stats"]["newsdata_to_google_news_light"] == 1
    assert summary["analysis_stats"]["partial_result_count"] == 1
    assert summary["analysis_stats"]["warning_count"] == 1
    assert summary["fundamental_coverage"]["hit_count"] == 1


def test_metrics_collector_reset_clears_metrics():
    collector = MetricsCollector()
    collector.record_vendor_call("yfinance", "success", 100, "quote")
    collector.record_cache_event("quote", True)
    collector.record_llm_call("quick", True, 50)
    collector.record_fallback("newsdata", "google_news_light", "news")
    collector.record_partial_result("pipeline_timeout")
    collector.record_warning("DATA_SOURCE_WARNING")

    collector.reset()
    summary = collector.get_summary()

    assert summary["vendor_stats"] == {}
    assert summary["cache_stats"] == {}
    assert summary["llm_stats"]["quick"]["calls"] == 0
    assert summary["fallback_stats"] == {}
    assert summary["analysis_stats"]["partial_result_count"] == 0
    assert summary["analysis_stats"]["warning_count"] == 0


def test_metrics_collector_does_not_store_api_keys_or_raw_bodies():
    collector = MetricsCollector()

    collector.record_vendor_call("api-key-secret", "success", 100, "raw_response_body")
    collector.record_cache_event("token-secret-cache", True)
    collector.record_warning("raw_response_body={secret}")

    dumped = json.dumps(collector.get_summary())

    assert "api-key-secret" not in dumped
    assert "token-secret-cache" not in dumped
    assert "raw_response_body" not in dumped
    assert "{secret}" not in dumped
