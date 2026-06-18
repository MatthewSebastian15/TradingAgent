from __future__ import annotations

import pytest
from tradingagents.dataflows.config import use_config
from tradingagents.dataflows.finnhub_common import (
    FinnhubConfigError,
    FinnhubRateLimitError,
    build_metadata,
    make_api_request,
    to_unix_timestamp,
    unavailable_response,
    unix_to_iso_date,
)

BASE_CONFIG = {
    "finnhub": {
        "enabled": True,
        "api_key": "test-token",
        "base_url": "https://example.test",
        "timeout_seconds": 1,
        "max_retries": 0,
        "retry_backoff_seconds": 0,
        "enable_stock_data": True,
    }
}


class FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")

    def json(self):
        return self._payload


def test_finnhub_disabled_returns_config_error():
    with (
        use_config({"finnhub": {"enabled": False, "api_key": "test"}}),
        pytest.raises(FinnhubConfigError),
    ):
        make_api_request("/quote", {"symbol": "AAPL"})


def test_missing_api_key_returns_config_error():
    with (
        use_config({"finnhub": {"enabled": True, "api_key": ""}}),
        pytest.raises(FinnhubConfigError),
    ):
        make_api_request("/quote", {"symbol": "AAPL"})


def test_make_api_request_success(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_common.requests.get",
        lambda *a, **k: FakeResponse(200, {"c": 10}),
    )
    with use_config(BASE_CONFIG):
        assert make_api_request("/quote", {"symbol": "AAPL"}) == {"c": 10}


def test_make_api_request_401_no_retry(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_common.requests.get", lambda *a, **k: FakeResponse(401, {})
    )
    with use_config(BASE_CONFIG), pytest.raises(FinnhubConfigError):
        make_api_request("/quote", {"symbol": "AAPL"})


def test_make_api_request_429_rate_limit(monkeypatch):
    monkeypatch.setattr(
        "tradingagents.dataflows.finnhub_common.requests.get", lambda *a, **k: FakeResponse(429, {})
    )
    with use_config(BASE_CONFIG), pytest.raises(FinnhubRateLimitError):
        make_api_request("/quote", {"symbol": "AAPL"})


def test_to_unix_timestamp_and_unix_to_iso_date():
    ts = to_unix_timestamp("2026-05-27")
    assert unix_to_iso_date(ts) == "2026-05-27"


def test_unavailable_response_schema():
    payload = unavailable_response("missing", endpoint="/quote", symbol="AAPL")
    assert payload["available"] is False
    assert payload["quality"]["confidence"] == "unavailable"


def test_build_metadata_schema():
    payload = build_metadata("/quote", confidence="medium", missing_fields=["timestamp"])
    assert payload["source"] == "finnhub"
    assert payload["quality"]["missing_fields"] == ["timestamp"]
