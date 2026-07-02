"""Unit tests for routes/serializers_report.py."""

from __future__ import annotations

import routes.serializers_analysis  # noqa: F401  (links serializer modules)
from routes.serializers_report import (
    cache_key,
    request_warnings,
    response_payload,
    with_data_fetched_at,
)
from routes.validation import AnalysisRequest
from services.report_disclaimer import REPORT_DISCLAIMER


def _request(**overrides) -> AnalysisRequest:
    fields = {"ticker": "AAPL", "trade_date": "2026-07-01", "market": "US"}
    fields.update(overrides)
    return AnalysisRequest(**fields)


def test_response_payload_includes_disclaimer_and_envelope():
    payload = response_payload("req-123", _request(), {"decision": "Hold"})
    assert payload["disclaimer"] == REPORT_DISCLAIMER
    assert payload["request_id"] == "req-123"
    assert payload["ticker"] == "AAPL"
    assert payload["exchange"] == "US"
    assert payload["currency"] == "USD"
    assert payload["decision"] == "Hold"
    assert payload["analysis_params"]["normalized_ticker"] == "AAPL"
    assert payload["agents_used"]


def test_response_payload_idx_ticker_maps_exchange_and_currency():
    payload = response_payload("req-1", _request(ticker="BBCA.JK", market="ID"), {})
    assert payload["exchange"] == "IDX"
    assert payload["currency"] == "IDR"


def test_response_payload_missing_sections_default_without_error():
    # Empty result_fields: sprint5 sections still attach with safe fallbacks.
    payload = response_payload("req-2", _request(), {})
    assert "entry_quality" in payload
    assert "position_sizing" in payload
    assert payload["position_sizing"].get("market") in {"US", "UNKNOWN"}


def test_with_data_fetched_at_stamps_once():
    stamped = with_data_fetched_at({"a": 1})
    assert stamped["data_fetched_at"]
    again = with_data_fetched_at({"data_fetched_at": "fixed"})
    assert again["data_fetched_at"] == "fixed"


def test_request_warnings_fast_depth_with_debate_rounds():
    assert request_warnings(_request(analysis_depth="fast", max_debate_rounds=2))
    assert request_warnings(_request(analysis_depth="fast", max_debate_rounds=1)) == []
    assert request_warnings(_request(analysis_depth="balanced", max_debate_rounds=2)) == []


def test_cache_key_reflects_request_fields():
    key = cache_key(_request())
    assert key.ticker == "AAPL"
    assert key.trade_date == "2026-07-01"
    assert cache_key(_request()) == key  # deterministic
    assert cache_key(_request(ticker="MSFT")) != key
