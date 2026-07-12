from __future__ import annotations

import asyncio
import time
from datetime import datetime

from analysis_cache import AnalysisCacheKey, AnalysisJobStore
from owner_session import owner_identifier

_TEST_OWNER_IDENTIFIER = owner_identifier("0" * 32)


def _mock_result() -> dict:
    return {
        "decision": "Buy",
        "full_decision": "Mocked final decision",
        "executive_summary": "Mocked summary",
        "investment_thesis": "Mocked thesis",
        "price_target": 10000,
        "time_horizon": "1M",
        "confidence_score": 0.8,
        "suggested_allocation_percent": 10,
        "entry_price": 9000,
        "stop_loss": 8500,
        "take_profit": 10500,
        "risk_reward_ratio": 3.0,
        "risk_reward_display": "1:3",
        "max_drawdown_estimate": 0.08,
        "volatility_level": "medium",
        "position_sizing_reason": "Test sizing",
        "rebalancing_action": "No change",
        "key_catalysts": ["earnings"],
        "invalidation_conditions": ["breakdown"],
        "data_quality": {"price_data": "ok", "fundamentals": "ok", "news": "ok", "warnings": []},
    }


def _cache_key(ticker: str) -> AnalysisCacheKey:
    return AnalysisCacheKey(
        ticker=ticker,
        trade_date="2026-05-14",
        provider="google",
        quick_model="test-quick",
        deep_model="test-deep",
        analysis_mode="balanced",
        analysis_depth="balanced",
        time_horizon_months=1,
        max_debate_rounds=1,
        response_detail="summary",
    )


def _create_job_and_get_result(client, monkeypatch, payload, headers):
    """Create a job with a mocked pipeline and return the completed job summary."""

    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        return _mock_result()

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)

    create = client.post("/api/analysis/jobs", json=payload, headers=headers)
    assert create.status_code == 200
    job_id = create.json()["job_id"]

    for _ in range(50):
        summary = client.get(f"/api/analysis/jobs/{job_id}", headers=headers)
        assert summary.status_code == 200
        if summary.json()["status"] in {"completed", "failed"}:
            return summary.json()
        time.sleep(0.05)
    raise AssertionError("job did not complete in time")


def test_job_flow_accepts_valid_request_and_returns_result(client, monkeypatch):
    summary = _create_job_and_get_result(
        client,
        monkeypatch,
        payload={
            "ticker": "BBCA.JK",
            "trade_date": "2026-05-14",
            "time_horizon_months": 2,
            "max_debate_rounds": 3,
        },
        headers={"x-api-key": "route-test-key"},
    )

    assert summary["status"] == "completed"
    body = summary["result"]
    assert body["ticker"] == "BBCA.JK"
    assert body["trade_date"] == "2026-05-14"
    assert body["time_horizon_months"] == 2
    assert body["decision"] == "Buy"
    assert datetime.fromisoformat(body["analysis_created_at"])
    assert body["data_quality"]["price_data"] == "ok"


def test_job_flow_returns_result_when_history_write_fails(client, monkeypatch):
    class BrokenRepository:
        def save_analysis(self, **kwargs):
            raise OSError("history database unavailable")

    monkeypatch.setattr("routes.analysis.get_analysis_repository", lambda: BrokenRepository())

    summary = _create_job_and_get_result(
        client,
        monkeypatch,
        payload={"ticker": "AAPL", "market": "US", "trade_date": "2026-05-14"},
        headers={"x-api-key": "history-fail-test-key"},
    )

    assert summary["status"] == "completed"
    assert summary["result"]["ticker"] == "AAPL"


def test_job_flow_fast_mode_warns_when_debate_rounds_are_ignored(client, monkeypatch):
    summary = _create_job_and_get_result(
        client,
        monkeypatch,
        payload={
            "ticker": "BBCA.JK",
            "trade_date": "2026-05-14",
            "analysis_depth": "fast",
            "max_debate_rounds": 5,
        },
        headers={"x-api-key": "fast-warning-test-key"},
    )

    warnings = summary["result"]["warnings"]
    assert len(warnings) == 1
    assert "max_debate_rounds greater than 1 is ignored" in warnings[0]


def test_job_create_rejects_invalid_date_before_pipeline_runs(client, monkeypatch):
    async def should_not_run(*args, **kwargs):
        raise AssertionError("Pipeline should not run for invalid input")

    monkeypatch.setattr("routes.analysis._run_stream_pipeline", should_not_run)

    response = client.post(
        "/api/analysis/jobs",
        json={"ticker": "BBCA.JK", "trade_date": "2026-99-99", "max_debate_rounds": 1},
        headers={"x-api-key": "validation-test-key"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"
    assert "trade_date" in response.json()["error"]["details"]["fields"]


def test_job_create_rejects_oversized_json_body_before_storing_job(client, monkeypatch):
    async def should_not_run(*args, **kwargs):
        raise AssertionError("Pipeline should not run for oversized job input")

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", should_not_run)

    response = client.post(
        "/api/analysis/jobs",
        content='{"ticker":"' + ("A" * 70000) + '"}',
        headers={"content-type": "application/json", "x-api-key": "job-body-limit-test-key"},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_BODY_TOO_LARGE"
    assert asyncio.run(store.stats())["jobs"] == 0


def test_job_completes_from_result_cache_without_rerunning_pipeline(client, monkeypatch):
    from routes import analysis as analysis_routes
    from routes.validation import AnalysisRequest, normalize_and_validate_analysis_request

    async def should_not_run(*args, **kwargs):
        raise AssertionError("pipeline must not run on a result-cache hit")

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", should_not_run)
    monkeypatch.setattr(
        "routes.analysis.ROUTE_DEPS",
        analysis_routes.AnalysisRouteDependencies(
            run_preflight=False,
            enable_result_cache=True,
            enable_cache_deduplication=True,
        ),
    )

    payload = {"ticker": "CACHE1", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    req = normalize_and_validate_analysis_request(AnalysisRequest(**payload))
    asyncio.run(analysis_routes._RESULT_CACHE.set(analysis_routes._cache_key(req), _mock_result()))

    headers = {"x-api-key": "job-cache-test-key"}
    create = client.post("/api/analysis/jobs", json=payload, headers=headers)
    assert create.status_code == 200
    job_id = create.json()["job_id"]

    for _ in range(50):
        summary = client.get(f"/api/analysis/jobs/{job_id}", headers=headers)
        if summary.json()["status"] in {"completed", "failed"}:
            break
        time.sleep(0.05)

    assert summary.json()["status"] == "completed"
    assert summary.json()["result"]["decision"] == "Buy"


def test_job_endpoints_are_bound_to_owner(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        return _mock_result()

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)

    payload = {"ticker": "MSFT", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    shared_proxy_headers = {"x-api-key": "shared-proxy-key"}
    client.headers.pop("x-owner-token", None)
    owner_token = client.post("/api/session", headers=shared_proxy_headers).json()["owner_token"]
    client.cookies.clear()
    other_token = client.post("/api/session", headers=shared_proxy_headers).json()["owner_token"]
    owner_headers = {**shared_proxy_headers, "x-owner-token": owner_token}
    other_headers = {**shared_proxy_headers, "x-owner-token": other_token}

    create_response = client.post("/api/analysis/jobs", json=payload, headers=owner_headers)
    assert create_response.status_code == 200
    job_id = create_response.json()["job_id"]

    assert client.get(f"/api/analysis/jobs/{job_id}", headers=owner_headers).status_code == 200

    wrong_get = client.get(f"/api/analysis/jobs/{job_id}", headers=other_headers)
    wrong_events = client.get(f"/api/analysis/jobs/{job_id}/events", headers=other_headers)
    wrong_delete = client.delete(f"/api/analysis/jobs/{job_id}", headers=other_headers)

    assert wrong_get.status_code == 400
    assert wrong_get.json()["error"]["code"] == "BAD_REQUEST"
    assert wrong_events.status_code == 400
    assert wrong_events.json()["error"]["code"] == "BAD_REQUEST"
    assert wrong_delete.status_code == 400
    assert wrong_delete.json()["error"]["code"] == "BAD_REQUEST"


def test_job_lookup_rejects_request_id_fallback(client, monkeypatch):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)

    async def create_completed_job():
        job = await store.create(
            owner_id="owner-1",
            request_id="request-fallback",
            cache_key=_cache_key("AAPL"),
            payload={"ticker": "AAPL", "trade_date": "2026-05-14", "max_debate_rounds": 1},
        )
        await job.complete({"request_id": "request-fallback", "ticker": "AAPL", "decision": "Hold"})

    asyncio.run(create_completed_job())

    response = client.get("/api/analysis/jobs/request-fallback")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_analysis_job_endpoint_falls_back_to_history_repository(
    client, monkeypatch, analysis_repository
):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    result = {
        "request_id": "history-job-request",
        "ticker": "MSFT",
        "market": "US",
        "trade_date": "2026-05-14",
    }
    analysis_repository.save_analysis(
        result=result,
        request_payload={"ticker": "MSFT", "trade_date": "2026-05-14"},
        job_id="history-job",
        owner_id=_TEST_OWNER_IDENTIFIER,
    )

    response = client.get("/api/analysis/jobs/history-job")

    assert response.status_code == 200
    assert response.json()["job_id"] == "history-job"
    assert response.json()["request_id"] == "history-job-request"
    assert response.json()["status"] == "completed"
    assert response.json()["result"] == result


def test_analysis_job_history_fallback_is_owner_scoped(client, monkeypatch, analysis_repository):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    analysis_repository.save_analysis(
        result={
            "request_id": "other-owner-request",
            "ticker": "MSFT",
            "market": "US",
            "trade_date": "2026-05-14",
        },
        request_payload={"ticker": "MSFT", "trade_date": "2026-05-14"},
        job_id="other-owner-job",
        owner_id=owner_identifier("f" * 32),
    )

    response = client.get("/api/analysis/jobs/other-owner-job")

    assert response.status_code == 400
    assert "other-owner-request" not in response.text


def test_market_quotes_rejects_invalid_ticker_before_fetch(client, monkeypatch):
    async def should_not_fetch(symbols):
        raise AssertionError("market quote fetch should not run for invalid symbols")

    monkeypatch.setattr("routes.market._fetch_quotes", should_not_fetch)

    response = client.get(
        "/api/market/quotes",
        params={"symbols": "@@@,AAPL"},
        headers={"x-api-key": "market-invalid-test-key"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"
    assert "ticker" in response.json()["error"]["details"]["fields"]
