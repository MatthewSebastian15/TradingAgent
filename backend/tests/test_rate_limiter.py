from __future__ import annotations

import asyncio
from datetime import date
from types import SimpleNamespace

from analysis_cache import AnalysisJobStore
from rate_limiter import RateLimitPolicy


def test_rate_limit_returns_429(client, monkeypatch):
    async def fake_run_pipeline_async(req, request_id):
        return {
            "decision": "Hold",
            "full_decision": "Mocked decision",
            "executive_summary": None,
            "investment_thesis": None,
            "price_target": None,
            "time_horizon": None,
            "confidence_score": None,
            "suggested_allocation_percent": None,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward_ratio": None,
            "max_drawdown_estimate": None,
            "volatility_level": None,
            "position_sizing_reason": None,
            "rebalancing_action": None,
            "key_catalysts": [],
            "invalidation_conditions": [],
            "data_quality": {"price_data": "ok", "fundamentals": "missing", "news": "missing", "warnings": []},
        }

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)
    monkeypatch.setattr(
        "routes.analysis.request_policy",
        lambda: RateLimitPolicy(scope="request-test", max_per_minute=1, max_concurrent=1),
    )

    payload = {"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    headers = {"x-api-key": "same-api-key"}

    first = client.post("/api/analyze", json=payload, headers=headers)
    second = client.post("/api/analyze", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"


def test_ticker_validate_is_rate_limited(client, monkeypatch):
    async def fake_preflight_market_data(req):
        return None

    monkeypatch.setattr("routes.analysis._preflight_market_data", fake_preflight_market_data)
    monkeypatch.setattr(
        "routes.analysis.request_policy",
        lambda: RateLimitPolicy(scope="ticker-validate-test", max_per_minute=1, max_concurrent=1),
    )

    params = {"ticker": "BBCA", "trade_date": date.today().strftime("%Y-%m-%d")}
    headers = {"x-api-key": "same-ticker-validation-key"}

    first = client.get("/api/ticker/validate", params=params, headers=headers)
    second = client.get("/api/ticker/validate", params=params, headers=headers)

    assert first.status_code == 200
    assert first.json()["ticker"] == "BBCA.JK"
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"


def test_configured_api_key_must_match(client, monkeypatch):
    async def fake_run_pipeline_async(req, request_id):
        return {
            "decision": "Hold",
            "full_decision": "Mocked decision",
            "executive_summary": None,
            "investment_thesis": None,
            "price_target": None,
            "time_horizon": None,
            "confidence_score": None,
            "suggested_allocation_percent": None,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward_ratio": None,
            "max_drawdown_estimate": None,
            "volatility_level": None,
            "position_sizing_reason": None,
            "rebalancing_action": None,
            "key_catalysts": [],
            "invalidation_conditions": [],
            "data_quality": {"price_data": "ok", "fundamentals": "missing", "news": "missing", "warnings": []},
        }

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)
    monkeypatch.setattr("rate_limiter.llm", SimpleNamespace(api_key="expected-key"))

    payload = {"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 1}

    rejected = client.post("/api/analyze", json=payload, headers={"x-api-key": "wrong-key"})
    accepted = client.post("/api/analyze", json=payload, headers={"x-api-key": "expected-key"})

    assert rejected.status_code == 429
    assert rejected.json()["error"]["code"] == "RATE_LIMITED"
    assert rejected.json()["error"]["message"] == "Invalid API key."
    assert accepted.status_code == 200


def test_job_create_rejects_invalid_api_key_before_storing_job(client, monkeypatch):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("rate_limiter.llm", SimpleNamespace(api_key="expected-key"))

    response = client.post(
        "/api/analysis/jobs",
        json={"ticker": "MSFT", "trade_date": "2026-05-14", "max_debate_rounds": 1},
        headers={"x-api-key": "wrong-key"},
    )

    assert response.status_code == 429
    assert response.json()["error"]["message"] == "Invalid API key."
    assert asyncio.run(store.stats())["jobs"] == 0


def test_job_create_rate_limit_runs_before_storing_second_job(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        return {"decision": "Hold", "data_quality": {"price_data": "ok", "fundamentals": "ok", "news": "ok", "warnings": []}}

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)
    monkeypatch.setattr(
        "routes.analysis.stream_policy",
        lambda: RateLimitPolicy(scope="job-create-limit-test", max_per_minute=1, max_concurrent=1),
    )

    payload = {"ticker": "MSFT", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    headers = {"x-api-key": "same-job-create-key"}

    first = client.post("/api/analysis/jobs", json=payload, headers=headers)
    second = client.post("/api/analysis/jobs", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"
    assert asyncio.run(store.stats())["jobs"] == 1


def test_status_endpoint_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(
        "routes.analysis.request_policy",
        lambda: RateLimitPolicy(scope="status-limit-test", max_per_minute=1, max_concurrent=1),
    )

    headers = {"x-api-key": "same-status-key"}

    first = client.get("/api/status", headers=headers)
    second = client.get("/api/status", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"
