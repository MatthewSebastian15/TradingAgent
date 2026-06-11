from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import pytest

from analysis_cache import AnalysisCacheKey, AnalysisJobStore
from owner_session import issue_owner_session, owner_identifier, owner_identifier_from_token

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


def test_analyze_accepts_valid_request_and_returns_result(client, monkeypatch):
    async def fake_run_pipeline_async(req, request_id):
        return _mock_result()

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)

    response = client.post(
        "/api/analyze",
        json={"ticker": "BBCA.JK", "trade_date": "2026-05-14", "time_horizon_months": 2, "max_debate_rounds": 3},
        headers={"x-api-key": "route-test-key"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "BBCA.JK"
    assert body["trade_date"] == "2026-05-14"
    assert body["time_horizon_months"] == 2
    assert body["decision"] == "Buy"
    assert datetime.fromisoformat(body["analysis_created_at"])
    assert datetime.fromisoformat(body["data_fetched_at"])
    assert body["data_quality"]["price_data"] == "ok"


def test_analyze_persists_completed_result(client, monkeypatch, analysis_repository):
    async def fake_run_pipeline_async(req, request_id):
        return _mock_result()

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)

    response = client.post(
        "/api/analyze",
        json={"ticker": "AAPL", "market": "US", "trade_date": "2026-05-14", "max_debate_rounds": 1},
    )

    assert response.status_code == 200
    stored = analysis_repository.get_analysis(response.json()["request_id"], owner_id=_TEST_OWNER_IDENTIFIER)
    assert stored is not None
    assert stored["request_id"] == response.json()["request_id"]
    assert stored["ticker"] == "AAPL"
    assert stored["decision"] == response.json()["decision"]


def test_analyze_returns_result_when_history_write_fails(client, monkeypatch):
    async def fake_run_pipeline_async(req, request_id):
        return _mock_result()

    class BrokenRepository:
        def save_analysis(self, **kwargs):
            raise OSError("history database unavailable")

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)
    monkeypatch.setattr("routes.analysis.get_analysis_repository", lambda: BrokenRepository())

    response = client.post(
        "/api/analyze",
        json={"ticker": "AAPL", "market": "US", "trade_date": "2026-05-14", "max_debate_rounds": 1},
    )

    assert response.status_code == 200
    assert response.json()["ticker"] == "AAPL"


def test_analyze_fast_mode_warns_when_debate_rounds_are_ignored(client, monkeypatch):
    async def fake_run_pipeline_async(req, request_id):
        return _mock_result()

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)

    response = client.post(
        "/api/analyze",
        json={"ticker": "BBCA.JK", "trade_date": "2026-05-14", "analysis_depth": "fast", "max_debate_rounds": 5},
        headers={"x-api-key": "fast-warning-test-key"},
    )

    assert response.status_code == 200
    warnings = response.json()["warnings"]
    assert len(warnings) == 1
    assert "max_debate_rounds greater than 1 is ignored" in warnings[0]


def test_analyze_rejects_invalid_date_before_pipeline_runs(client, monkeypatch):
    async def should_not_run(*args, **kwargs):
        raise AssertionError("Pipeline should not run for invalid input")

    monkeypatch.setattr("routes.analysis._run_pipeline_async", should_not_run)

    response = client.post(
        "/api/analyze",
        json={"ticker": "BBCA.JK", "trade_date": "2026-99-99", "max_debate_rounds": 1},
        headers={"x-api-key": "validation-test-key"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"
    assert "trade_date" in response.json()["error"]["details"]["fields"]


def test_analyze_rejects_oversized_json_body_before_validation(client, monkeypatch):
    async def should_not_run(*args, **kwargs):
        raise AssertionError("Pipeline should not run for oversized input")

    monkeypatch.setattr("routes.analysis._run_pipeline_async", should_not_run)

    response = client.post(
        "/api/analyze",
        content='{"ticker":"' + ("A" * 70000) + '"}',
        headers={"content-type": "application/json", "x-api-key": "body-limit-test-key"},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_BODY_TOO_LARGE"


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


def test_preflight_stays_enabled_when_pipeline_callable_is_wrapped(monkeypatch):
    from routes import analysis
    from routes.validation import AnalysisRequest

    preflight_calls: list[str] = []
    pipeline_calls = 0

    async def fake_preflight(req: AnalysisRequest) -> None:
        preflight_calls.append(req.ticker)

    async def renamed_pipeline(req: AnalysisRequest, request_id: str, request=None):
        nonlocal pipeline_calls
        pipeline_calls += 1
        return _mock_result()

    async def decorated_pipeline(*args, **kwargs):
        return await renamed_pipeline(*args, **kwargs)

    monkeypatch.setattr(
        "routes.analysis.ROUTE_DEPS",
        analysis.AnalysisRouteDependencies(
            run_preflight=True,
            enable_result_cache=False,
            enable_cache_deduplication=False,
        ),
    )
    monkeypatch.setattr("routes.analysis._preflight_market_data", fake_preflight)
    monkeypatch.setattr("routes.analysis._run_pipeline_async", decorated_pipeline)

    req = AnalysisRequest(ticker="AAPL", trade_date="2026-05-14", max_debate_rounds=1)
    result = asyncio.run(analysis._compute_result_fields(req, "wrapped-preflight-test"))

    assert preflight_calls == ["AAPL"]
    assert pipeline_calls == 1
    assert result["decision"] == "Buy"


def test_route_result_cache_stays_enabled_when_pipeline_callable_is_wrapped(client, monkeypatch):
    from routes import analysis

    calls = 0

    async def renamed_pipeline(req, request_id, request=None):
        nonlocal calls
        calls += 1
        return _mock_result()

    async def decorated_pipeline(*args, **kwargs):
        return await renamed_pipeline(*args, **kwargs)

    monkeypatch.setattr(
        "routes.analysis.ROUTE_DEPS",
        analysis.AnalysisRouteDependencies(
            run_preflight=False,
            enable_result_cache=True,
            enable_cache_deduplication=True,
        ),
    )
    monkeypatch.setattr("routes.analysis._run_pipeline_async", decorated_pipeline)

    payload = {"ticker": "CACHE1", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    headers = {"x-api-key": "wrapped-cache-test-key"}

    first = client.post("/api/analyze", json=payload, headers=headers)
    second = client.post("/api/analyze", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert calls == 1
    assert second.json()["cache"] == {"hit": True, "source": "result_cache"}


def test_route_cache_and_deduplication_can_be_disabled_explicitly():
    from routes.analysis import _get_or_start_analysis
    from routes.validation import AnalysisRequest

    calls = 0

    async def main():
        nonlocal calls
        req = AnalysisRequest(ticker="NOCACHE1", trade_date="2026-05-14", max_debate_rounds=1)

        async def factory():
            nonlocal calls
            calls += 1
            return {"decision": "Hold"}

        first = await _get_or_start_analysis(req, factory, use_cache=False, use_deduplication=False)
        second = await _get_or_start_analysis(req, factory, use_cache=False, use_deduplication=False)
        return first, second

    first, second = asyncio.run(main())

    assert calls == 2
    assert first == {"decision": "Hold"}
    assert second == {"decision": "Hold"}


def test_get_or_start_analysis_shares_in_flight_work():
    from routes.analysis import _get_or_start_analysis
    from routes.validation import AnalysisRequest

    calls = 0

    async def main():
        nonlocal calls
        req = AnalysisRequest(ticker="BBCA.JK", trade_date="2026-05-14", max_debate_rounds=1)
        started = asyncio.Event()
        release = asyncio.Event()

        async def factory():
            nonlocal calls
            calls += 1
            started.set()
            await release.wait()
            return {"decision": "Hold"}

        first = asyncio.create_task(_get_or_start_analysis(req, factory, use_cache=False))
        await started.wait()
        second = asyncio.create_task(_get_or_start_analysis(req, factory, use_cache=False))
        await asyncio.sleep(0)
        release.set()
        return await asyncio.gather(first, second)

    results = asyncio.run(main())

    assert calls == 1
    assert results[0]["decision"] == "Hold"
    assert results[1]["decision"] == "Hold"
    assert results[1]["cache"] == {"hit": True, "source": "in_flight"}


def test_run_pipeline_async_cancels_worker_on_client_disconnect(monkeypatch):
    from routes.analysis import _run_pipeline_async
    from routes.validation import AnalysisRequest

    executor = ThreadPoolExecutor(max_workers=1)
    started = threading.Event()

    class CancelEvent:
        def __init__(self):
            self._event = threading.Event()

        def is_set(self):
            return self._event.is_set()

        def set(self):
            self._event.set()

    cancel_event = CancelEvent()

    async def fake_get_executor():
        return executor

    async def fake_new_cancel_event():
        return cancel_event

    def fake_run_pipeline(*args):
        worker_cancel_event = args[-1]
        started.set()
        while not worker_cancel_event.is_set():
            time.sleep(0.01)
        return {"decision": "Hold"}

    class DisconnectingRequest:
        async def is_disconnected(self):
            return await asyncio.to_thread(started.wait, 1)

    monkeypatch.setattr("routes.analysis._get_executor", fake_get_executor)
    monkeypatch.setattr("routes.analysis._new_cancel_event", fake_new_cancel_event)
    monkeypatch.setattr("routes.analysis._run_pipeline", fake_run_pipeline)

    async def main():
        req = AnalysisRequest(ticker="BBCA.JK", trade_date="2026-05-14", max_debate_rounds=1)
        with pytest.raises(asyncio.CancelledError):
            await _run_pipeline_async(req, "disconnect-test", request=DisconnectingRequest())

    try:
        asyncio.run(main())
        assert started.is_set()
        assert cancel_event.is_set()
    finally:
        executor.shutdown(wait=True, cancel_futures=True)


def test_job_endpoints_are_bound_to_owner(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        return _mock_result()

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)

    payload = {"ticker": "MSFT", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    shared_proxy_headers = {"x-api-key": "shared-proxy-key"}
    owner_token = client.post("/api/session", headers=shared_proxy_headers).json()["owner_token"]
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


def test_analysis_result_endpoint_looks_up_by_request_id(client, monkeypatch):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    owner_token = issue_owner_session()["owner_token"]
    other_token = issue_owner_session()["owner_token"]

    async def create_completed_job():
        job = await store.create(
            owner_id=owner_identifier_from_token(owner_token),
            request_id="request-lookup",
            cache_key=_cache_key("MSFT"),
            payload={"ticker": "MSFT", "trade_date": "2026-05-14", "max_debate_rounds": 1},
        )
        await job.complete(
            {"request_id": "request-lookup", "ticker": "MSFT", "trade_date": "2026-05-14", "decision": "Buy"}
        )

    asyncio.run(create_completed_job())

    response = client.get("/api/analysis/request-lookup", headers={"x-owner-token": owner_token})
    wrong_owner_response = client.get("/api/analysis/request-lookup", headers={"x-owner-token": other_token})

    assert response.status_code == 200
    assert response.json()["request_id"] == "request-lookup"
    assert response.json()["ticker"] == "MSFT"
    assert wrong_owner_response.status_code == 404


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


def test_analysis_result_endpoint_returns_404_for_expired_result(client, monkeypatch):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)

    response = client.get("/api/analysis/missing-request")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_analysis_result_endpoint_falls_back_to_history_repository(client, monkeypatch, analysis_repository):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    result = {"request_id": "history-request", "ticker": "MSFT", "market": "US", "trade_date": "2026-05-14"}
    analysis_repository.save_analysis(result=result, owner_id=_TEST_OWNER_IDENTIFIER)

    response = client.get("/api/analysis/history-request")

    assert response.status_code == 200
    assert response.json()["request_id"] == "history-request"
    assert response.json()["ticker"] == "MSFT"
    assert response.json()["trade_date"] == "2026-05-14"


def test_analysis_job_endpoint_falls_back_to_history_repository(client, monkeypatch, analysis_repository):
    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    result = {"request_id": "history-job-request", "ticker": "MSFT", "market": "US", "trade_date": "2026-05-14"}
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
