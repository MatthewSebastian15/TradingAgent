from __future__ import annotations

import asyncio
import json
import os

from analysis_cache import AnalysisCacheKey, AnalysisJobStore
from owner_session import owner_identifier

_TEST_OWNER_IDENTIFIER = owner_identifier("0" * 32)


def _stream_result() -> dict:
    return {
        "decision": "Buy",
        "full_decision": "Mocked streaming decision",
        "executive_summary": "Streaming summary",
        "investment_thesis": "Streaming thesis",
        "price_target": 10000,
        "time_horizon": "1M",
        "confidence_score": 0.75,
        "suggested_allocation_percent": 8,
        "entry_price": 9200,
        "stop_loss": 8800,
        "take_profit": 10400,
        "risk_reward_ratio": 3.0,
        "risk_reward_display": "1:3",
        "max_drawdown_estimate": 0.07,
        "volatility_level": "medium",
        "position_sizing_reason": "Mock position sizing",
        "has_existing_position": False,
        "position_quantity": None,
        "average_entry_price": None,
        "rebalancing_action": "Open new position",
        "position_action": None,
        "new_entry_action": "Allowed with validated entry",
        "position_size_hint": "Use standard starter size and avoid oversized entry.",
        "key_catalysts": ["volume"],
        "invalidation_conditions": ["support break"],
        "data_quality": {
            "price_data": "ok",
            "fundamentals": "partial",
            "news": "missing",
            "warnings": [],
        },
    }


def _collect_sse_events(response_text: str) -> list[tuple[str | None, dict]]:
    events: list[tuple[str | None, dict]] = []
    current_event: str | None = None

    for raw_line in response_text.splitlines():
        line = raw_line.strip()
        if not line:
            current_event = None
            continue
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ")
        elif line.startswith("data: "):
            events.append((current_event, json.loads(line.removeprefix("data: "))))

    return events


def _analysis_cache_key(response_detail: str = "full") -> AnalysisCacheKey:
    return AnalysisCacheKey(
        ticker="AAPL",
        trade_date="2026-05-14",
        provider=os.environ["LLM_PROVIDER"],
        quick_model=os.environ["QUICK_THINK_LLM"],
        deep_model=os.environ["DEEP_THINK_LLM"],
        analysis_mode="balanced",
        analysis_depth="balanced",
        time_horizon_months=1,
        max_debate_rounds=1,
        response_detail=response_detail,
    )


def test_job_event_endpoint_replays_after_browser_refresh(client, monkeypatch, analysis_repository):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        await queue.put(
            {
                "type": "progress",
                "payload": {
                    "request_id": request_id,
                    "ticker": req.ticker,
                    "trade_date": req.trade_date,
                    "agent_id": "market_analyst",
                    "agent_name": "Market Analyst",
                    "status": "completed",
                    "status_message": "Mock market analysis completed.",
                },
            }
        )
        return _stream_result()

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)

    headers = {"x-api-key": "sse-refresh-test-key"}
    create_response = client.post(
        "/api/analysis/jobs",
        json={"ticker": "AAPL", "trade_date": "2026-05-17", "max_debate_rounds": 1},
        headers=headers,
    )
    assert create_response.status_code == 200
    job_id = create_response.json()["job_id"]

    def read_events():
        with client.stream(
            "GET", f"/api/analysis/jobs/{job_id}/events", headers=headers
        ) as response:
            assert response.status_code == 200
            return _collect_sse_events(response.read().decode("utf-8"))

    first = read_events()
    second = read_events()

    assert [name for name, _ in first] == ["job", "progress", "result"]
    assert [name for name, _ in second] == ["job", "progress", "result"]
    assert first[1][1]["agent_id"] == "market_analyst"
    assert second[2][1]["decision"] == "Buy"
    assert (
        analysis_repository.get_analysis_by_job_id(job_id, owner_id=_TEST_OWNER_IDENTIFIER)[
            "ticker"
        ]
        == "AAPL"
    )


def test_job_event_stream_is_not_gzipped(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        await queue.put(
            {
                "type": "progress",
                "payload": {
                    "request_id": request_id,
                    "ticker": req.ticker,
                    "trade_date": req.trade_date,
                    "agent_id": "market_analyst",
                    "agent_name": "Market Analyst",
                    "status": "completed",
                    "status_message": "Mock market analysis completed.",
                },
            }
        )
        return _stream_result()

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)

    headers = {"x-api-key": "sse-no-gzip-test-key", "accept-encoding": "gzip"}
    create_response = client.post(
        "/api/analysis/jobs",
        json={"ticker": "AAPL", "trade_date": "2026-05-17", "max_debate_rounds": 1},
        headers=headers,
    )
    assert create_response.status_code == 200
    job_id = create_response.json()["job_id"]

    with client.stream("GET", f"/api/analysis/jobs/{job_id}/events", headers=headers) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers.get("content-encoding") is None
        events = _collect_sse_events(response.read().decode("utf-8"))

    assert [name for name, _ in events] == ["job", "progress", "result"]


def test_job_stream_forwards_pipeline_error_event(client, monkeypatch):
    async def fake_run_stream_pipeline(req, request_id, queue, cancel_event=None):
        raise RuntimeError("mock stream failure")

    store = AnalysisJobStore(ttl_seconds=60, max_entries=10, max_active_jobs=10)
    monkeypatch.setattr("routes.analysis._JOB_STORE", store)
    monkeypatch.setattr("routes.analysis._run_stream_pipeline", fake_run_stream_pipeline)

    headers = {"x-api-key": "sse-error-test-key"}
    create_response = client.post(
        "/api/analysis/jobs",
        json={"ticker": "AAPL", "trade_date": "2026-05-17", "max_debate_rounds": 1},
        headers=headers,
    )
    assert create_response.status_code == 200
    job_id = create_response.json()["job_id"]

    with client.stream("GET", f"/api/analysis/jobs/{job_id}/events", headers=headers) as response:
        assert response.status_code == 200
        events = _collect_sse_events(response.read().decode("utf-8"))

    error_payloads = [payload for name, payload in events if name == "error"]
    assert error_payloads
    assert error_payloads[0]["error"]["code"] == "PIPELINE_FAILED"


def test_completed_job_event_stream_replays_result():
    from analysis_cache import AnalysisJob
    from routes.analysis import _stream_job_events

    class ConnectedRequest:
        async def is_disconnected(self):
            return False

    async def main():
        job = AnalysisJob(
            id="job-1",
            request_id="request-1",
            owner_id="owner-1",
            cache_key=_analysis_cache_key(),
            payload={"ticker": "AAPL", "trade_date": "2026-05-14"},
            status="completed",
            result={"request_id": "request-1", "ticker": "AAPL", "decision": "Hold"},
        )
        events = []
        async for event in _stream_job_events(ConnectedRequest(), job):
            events.append(event)
        return events

    events = asyncio.run(main())
    assert [event["event"] for event in events] == ["job", "result"]
    assert json.loads(events[1]["data"])["decision"] == "Hold"


def test_running_job_event_stream_replays_history_to_multiple_subscribers():
    from analysis_cache import AnalysisJob
    from routes.analysis import _stream_job_events

    class ConnectedRequest:
        async def is_disconnected(self):
            return False

    async def collect(job):
        events = []
        async for event in _stream_job_events(ConnectedRequest(), job):
            events.append(event)
        return events

    async def main():
        job = AnalysisJob(
            id="job-1",
            request_id="request-1",
            owner_id="owner-1",
            cache_key=_analysis_cache_key(),
            payload={"ticker": "AAPL", "trade_date": "2026-05-14"},
            status="running",
        )
        await job.publish(
            "progress", {"request_id": "request-1", "agent_id": "market", "status": "completed"}
        )
        job.result = {"request_id": "request-1", "ticker": "AAPL", "decision": "Hold"}
        job.status = "completed"
        await job.publish("result", job.result)
        job.done_event.set()

        first, second = await asyncio.gather(collect(job), collect(job))
        return first, second

    first, second = asyncio.run(main())
    assert [event["event"] for event in first] == ["job", "progress", "result"]
    assert [event["event"] for event in second] == ["job", "progress", "result"]
    assert json.loads(first[1]["data"])["agent_id"] == "market"
    assert json.loads(second[2]["data"])["decision"] == "Hold"


def test_running_job_event_stream_yields_result_after_wait_notification():
    from analysis_cache import AnalysisJob
    from routes.analysis import _stream_job_events

    class ConnectedRequest:
        async def is_disconnected(self):
            return False

    async def collect(job):
        events = []
        async for event in _stream_job_events(ConnectedRequest(), job):
            events.append(event)
        return events

    async def main():
        job = AnalysisJob(
            id="job-1",
            request_id="request-1",
            owner_id="owner-1",
            cache_key=_analysis_cache_key(),
            payload={"ticker": "AAPL", "trade_date": "2026-05-14"},
            status="running",
        )

        collector = asyncio.create_task(collect(job))
        await asyncio.sleep(0.01)
        await job.publish(
            "progress", {"request_id": "request-1", "agent_id": "market", "status": "completed"}
        )
        await asyncio.sleep(0.01)
        await job.complete({"request_id": "request-1", "ticker": "AAPL", "decision": "Hold"})
        return await asyncio.wait_for(collector, timeout=1)

    events = asyncio.run(main())
    assert [event["event"] for event in events] == ["job", "progress", "result"]
    assert json.loads(events[2]["data"])["decision"] == "Hold"
