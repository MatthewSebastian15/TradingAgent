from __future__ import annotations

import json
from types import SimpleNamespace

import config


def test_debug_endpoint_disabled_by_default(client, monkeypatch):
    monkeypatch.setattr(config, "DEBUG_ENDPOINTS_ENABLED", False)

    response = client.get("/api/debug/health")

    assert response.status_code == 404


def test_debug_health_enabled_and_sanitized(client, monkeypatch):
    monkeypatch.setattr(config, "DEBUG_ENDPOINTS_ENABLED", True)
    monkeypatch.setattr(
        config,
        "llm",
        SimpleNamespace(
            provider="google",
            llm_api_key="secret-llm-key",
            quick_think_llm="gemini-3.1-flash-lite",
            deep_think_llm="gemini-3.5-flash",
        ),
    )
    monkeypatch.setattr(config, "FINNHUB_API_KEY", "secret-finnhub-key")
    monkeypatch.setattr(config, "MARKETAUX_API_KEY", "secret-marketaux-key")
    monkeypatch.setattr(config, "NEWSDATA_API_KEY", "secret-newsdata-key")
    monkeypatch.setattr(config, "ALPHA_VANTAGE_API_KEY", "secret-alpha-key")

    response = client.get("/api/debug/health")

    assert response.status_code == 200
    payload = response.json()
    dumped = json.dumps(payload)
    assert payload["feature_flags"]["DEBUG_ENDPOINTS_ENABLED"] is True
    assert payload["llm"]["api_key_present"] is True
    assert payload["vendors"]["finnhub"]["api_key_present"] is True
    assert "secret-llm-key" not in dumped
    assert "secret-finnhub-key" not in dumped
    assert "secret-marketaux-key" not in dumped
    assert "secret-newsdata-key" not in dumped
    assert "secret-alpha-key" not in dumped


def test_debug_vendor_enabled_and_sanitized(client, monkeypatch):
    monkeypatch.setattr(config, "DEBUG_ENDPOINTS_ENABLED", True)
    monkeypatch.setattr(config, "FINNHUB_API_KEY", "secret-finnhub-key")

    response = client.get("/api/debug/vendor/finnhub")

    assert response.status_code == 200
    payload = response.json()
    assert payload["vendor"] == "finnhub"
    assert payload["api_key_present"] is True
    assert "secret-finnhub-key" not in json.dumps(payload)


def test_debug_llm_usage_aggregates_per_agent(client, monkeypatch):
    monkeypatch.setattr(config, "DEBUG_ENDPOINTS_ENABLED", True)
    from tradingagents.llm_optimization import usage

    usage.reset_telemetry()
    usage.ingest_analysis_telemetry(
        {
            "agents": {
                "Market Analyst": {
                    "calls": 2,
                    "fallbacks": 1,
                    "cache_hits": 1,
                    "parse_ok": 1,
                    "total_latency_ms": 400.0,
                }
            }
        },
        ticker="PTPP.JK",
        news={"empty_reason": "No relevant company-specific news was found."},
    )

    response = client.get("/api/debug/llm-usage")

    assert response.status_code == 200
    payload = response.json()
    row = payload["agents"]["Market Analyst"]
    assert row["calls"] == 2
    assert row["fallbacks"] == 1
    assert row["cache_hits"] == 1
    assert row["parse_ok"] == 1
    assert row["fallback_rate"] == 0.5
    assert row["avg_latency_ms"] == 200.0
    assert payload["news_blank_feeds"][-1]["ticker"] == "PTPP.JK"


def test_debug_symbol_returns_resolution(client, monkeypatch):
    monkeypatch.setattr(config, "DEBUG_ENDPOINTS_ENABLED", True)

    response = client.get("/api/debug/symbol/AAPL")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ticker"] == "AAPL"
    assert payload["resolution"]["canonical"] == "AAPL"
    assert payload["resolution"]["search_verified"] is True
    assert "yfinance" in payload["resolution"]["vendor_symbols"]
    assert "news" in payload["source_priority"]
