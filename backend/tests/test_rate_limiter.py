from __future__ import annotations

import asyncio
import sqlite3
from datetime import date
from types import SimpleNamespace

from analysis_cache import AnalysisJobStore
from errors import RateLimitError
from rate_limiter import RateLimitPolicy, SQLiteRateLimiterBackend


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
            "data_quality": {
                "price_data": "ok",
                "fundamentals": "missing",
                "news": "missing",
                "warnings": [],
            },
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


def test_legacy_sse_rate_limit_returns_http_429(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        return {
            "decision": "Hold",
            "data_quality": {
                "price_data": "ok",
                "fundamentals": "ok",
                "news": "ok",
                "warnings": [],
            },
        }

    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)
    monkeypatch.setattr(
        "routes.analysis.stream_policy",
        lambda: RateLimitPolicy(scope="legacy-sse-limit-test", max_per_minute=1, max_concurrent=1),
    )

    payload = {"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    headers = {"x-api-key": "same-legacy-sse-key"}

    first = client.post("/api/analyze/stream", json=payload, headers=headers)
    second = client.post("/api/analyze/stream", json=payload, headers=headers)

    assert first.status_code == 200
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
            "data_quality": {
                "price_data": "ok",
                "fundamentals": "missing",
                "news": "missing",
                "warnings": [],
            },
        }

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)
    monkeypatch.setattr("rate_limiter.llm", SimpleNamespace(api_key="expected-key"))

    payload = {"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 1}

    rejected = client.post("/api/analyze", json=payload, headers={"x-api-key": "wrong-key"})
    accepted = client.post("/api/analyze", json=payload, headers={"x-api-key": "expected-key"})

    assert rejected.status_code == 401
    assert rejected.json()["error"]["code"] == "UNAUTHORIZED"
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

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Invalid API key."
    assert asyncio.run(store.stats())["jobs"] == 0


def test_job_create_rate_limit_runs_before_storing_second_job(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        return {
            "decision": "Hold",
            "data_quality": {
                "price_data": "ok",
                "fundamentals": "ok",
                "news": "ok",
                "warnings": [],
            },
        }

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
        "routes.analysis.status_policy",
        lambda: RateLimitPolicy(scope="status-limit-test", max_per_minute=1, max_concurrent=1),
    )

    headers = {"x-api-key": "same-status-key"}

    first = client.get("/api/status", headers=headers)
    second = client.get("/api/status", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"


def test_status_endpoint_uses_separate_request_bucket(client, monkeypatch):
    monkeypatch.setattr(
        "routes.analysis.request_policy",
        lambda: RateLimitPolicy(
            scope="status-request-separation-test", max_per_minute=1, max_concurrent=1
        ),
    )
    monkeypatch.setattr(
        "routes.analysis.status_policy",
        lambda: RateLimitPolicy(
            scope="status-separation-test", max_per_minute=10, max_concurrent=2
        ),
    )

    headers = {"x-api-key": "same-status-separation-key"}

    first = client.get("/api/status", headers=headers)
    second = client.get("/api/status", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200


def test_shared_proxy_key_uses_separate_owner_session_quotas(client, monkeypatch):
    monkeypatch.setattr("rate_limiter.llm", SimpleNamespace(api_key="shared-proxy-key"))
    monkeypatch.setattr(
        "routes.analysis.status_policy",
        lambda: RateLimitPolicy(
            scope="owner-session-limit-test", max_per_minute=1, max_concurrent=1
        ),
    )

    proxy_headers = {"x-api-key": "shared-proxy-key"}
    client.headers.pop("x-owner-token", None)
    owner_a = client.post("/api/session", headers=proxy_headers).json()["owner_token"]
    client.cookies.clear()
    owner_b = client.post("/api/session", headers=proxy_headers).json()["owner_token"]

    first_a = client.get("/api/status", headers={**proxy_headers, "x-owner-token": owner_a})
    first_b = client.get("/api/status", headers={**proxy_headers, "x-owner-token": owner_b})
    second_a = client.get("/api/status", headers={**proxy_headers, "x-owner-token": owner_a})

    assert first_a.status_code == 200
    assert first_b.status_code == 200
    assert second_a.status_code == 429


def test_owner_scoped_endpoint_rejects_missing_owner_token(client):
    response = client.get("/api/status", headers={"x-owner-token": ""})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_sqlite_stream_limiter_rejects_live_active_lease(tmp_path):
    backend = SQLiteRateLimiterBackend(str(tmp_path / "rate_limits.sqlite3"), ttl_seconds=60)
    policy = RateLimitPolicy(scope="stream", max_per_minute=100, max_concurrent=1)

    asyncio.run(backend.acquire("owner-a", policy))

    try:
        asyncio.run(backend.acquire("owner-a", policy))
    except RateLimitError:
        pass
    else:
        raise AssertionError("Expected live stream lease to be rate limited.")


def test_sqlite_stream_limiter_evicts_stale_active_lease(tmp_path):
    db_path = tmp_path / "rate_limits.sqlite3"
    backend = SQLiteRateLimiterBackend(str(db_path), ttl_seconds=60)
    policy = RateLimitPolicy(scope="stream", max_per_minute=100, max_concurrent=1)

    asyncio.run(backend.acquire("owner-a", policy))
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE rate_limit_buckets SET last_seen = 0 WHERE scope = ? AND identifier = ?",
            (policy.scope, "owner-a"),
        )

    asyncio.run(backend.acquire("owner-a", policy))

    with sqlite3.connect(db_path) as conn:
        active = conn.execute(
            "SELECT active FROM rate_limit_buckets WHERE scope = ? AND identifier = ?",
            (policy.scope, "owner-a"),
        ).fetchone()[0]
    assert active == 1


def test_market_quotes_endpoint_is_rate_limited(client, monkeypatch):
    async def fake_fetch_quotes(symbols):
        return [
            {"sym": symbol, "chg": "0.00%", "pos": True, "price": 1.0, "error": False}
            for symbol in symbols
        ]

    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)
    monkeypatch.setattr(
        "routes.market._MARKET_DATA_POLICY",
        RateLimitPolicy(scope="market-quotes-limit-test", max_per_minute=1, max_concurrent=1),
    )

    headers = {"x-api-key": "same-market-key"}

    first = client.get("/api/market/quotes?symbols=bbca,aapl", headers=headers)
    second = client.get("/api/market/quotes?symbols=bbca,aapl", headers=headers)

    assert first.status_code == 200
    assert [item["sym"] for item in first.json()["quotes"]] == ["BBCA.JK", "AAPL"]
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"


def test_market_quotes_use_separate_bucket_from_analysis_requests(client, monkeypatch):
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
            "data_quality": {
                "price_data": "ok",
                "fundamentals": "missing",
                "news": "missing",
                "warnings": [],
            },
        }

    async def fake_fetch_quotes(symbols):
        return [
            {
                "sym": symbol,
                "chg": "+1.00%",
                "pos": True,
                "price": 10.0,
                "volume": 1000,
                "error": False,
            }
            for symbol in symbols
        ]

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)
    monkeypatch.setattr("routes.market._fetch_quotes", fake_fetch_quotes)
    monkeypatch.setattr(
        "routes.analysis.request_policy",
        lambda: RateLimitPolicy(
            scope="analysis-market-separation-test", max_per_minute=1, max_concurrent=1
        ),
    )
    monkeypatch.setattr(
        "routes.market._MARKET_DATA_POLICY",
        RateLimitPolicy(scope="market-separation-test", max_per_minute=10, max_concurrent=2),
    )

    payload = {"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    headers = {"x-api-key": "same-analysis-market-key"}

    analysis = client.post("/api/analyze", json=payload, headers=headers)
    blocked_analysis = client.post("/api/analyze", json=payload, headers=headers)
    market = client.get("/api/market/quotes?symbols=NVDA", headers=headers)

    assert analysis.status_code == 200
    assert blocked_analysis.status_code == 429
    assert market.status_code == 200
    assert market.json()["quotes"][0]["sym"] == "NVDA"


def test_job_event_stream_does_not_consume_request_limit(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        return {
            "decision": "Hold",
            "data_quality": {
                "price_data": "ok",
                "fundamentals": "ok",
                "news": "ok",
                "warnings": [],
            },
        }

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)
    monkeypatch.setattr(
        "routes.analysis.request_policy",
        lambda: RateLimitPolicy(
            scope="job-events-request-test", max_per_minute=1, max_concurrent=1
        ),
    )
    monkeypatch.setattr(
        "routes.analysis.stream_policy",
        lambda: RateLimitPolicy(
            scope="job-events-stream-test", max_per_minute=10, max_concurrent=1
        ),
    )

    headers = {"x-api-key": "same-job-events-key"}
    create = client.post(
        "/api/analysis/jobs",
        json={"ticker": "MSFT", "trade_date": "2026-05-14", "max_debate_rounds": 1},
        headers=headers,
    )
    assert create.status_code == 200

    job_id = create.json()["job_id"]
    with client.stream("GET", f"/api/analysis/jobs/{job_id}/events", headers=headers) as response:
        assert response.status_code == 200
        response.read()

    first_summary = client.get(f"/api/analysis/jobs/{job_id}", headers=headers)
    second_summary = client.get(f"/api/analysis/jobs/{job_id}", headers=headers)

    assert first_summary.status_code == 200
    assert second_summary.status_code == 429
