from __future__ import annotations

import asyncio
import concurrent.futures
import threading
import time

from routes import pipeline_runner
from routes.serializers import build_partial_result
from routes.validation import AnalysisRequest


def _request() -> AnalysisRequest:
    return AnalysisRequest(
        ticker="AAPL",
        input_ticker="AAPL",
        market="US",
        trade_date="2026-06-01",
        time_horizon_months=1,
        max_debate_rounds=1,
        analysis_depth="fast",
        response_detail="full",
    )


def test_build_partial_result_contract():
    result = build_partial_result(
        _request(),
        partial_reason="pipeline_timeout",
        completed_stages=["symbol_resolution", "market_data_fetch", "technical_analysis"],
        timeout_seconds=120,
    )

    assert result["is_partial"] is True
    assert result["partial_reason"] == "pipeline_timeout"
    assert result["completed_stages"] == ["symbol_resolution", "market_data_fetch", "technical_analysis"]
    assert "final_synthesis" in result["missing_stages"]
    assert result["partial_signal"] == "WAIT"
    assert result["partial_confidence"] == 0
    assert result["available_data"]["price"] is True
    assert result["available_data"]["technical"] is True
    assert result["available_data"]["ai_signal"] is False
    assert result["llm_decision"] is None
    assert result["final_decision"] == "Hold"
    assert any("pipeline timeout" in warning for warning in result["warnings"])


def test_pipeline_timeout_returns_partial_result(monkeypatch):
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    cancel_event = threading.Event()

    async def get_executor():
        return executor

    async def new_cancel_event():
        return cancel_event

    def slow_pipeline(*args):
        time.sleep(0.05)
        return {"decision": "Buy"}

    async def main():
        monkeypatch.setattr(pipeline_runner, "PIPELINE_TIMEOUT_SECONDS", 0.01)
        ctx = pipeline_runner.PipelineRunContext(
            req=_request(),
            request_id="timeout-test",
            get_executor_func=get_executor,
            new_cancel_event_func=new_cancel_event,
            run_pipeline_func=slow_pipeline,
        )
        return await pipeline_runner.run_pipeline_async(ctx)

    try:
        result = asyncio.run(main())
    finally:
        executor.shutdown(wait=True, cancel_futures=True)

    assert result["is_partial"] is True
    assert result["partial_reason"] == "pipeline_timeout"
    assert result["partial_signal"] == "WAIT"
    assert result["partial_confidence"] == 0
    assert result["llm_decision"] is None
    assert "final_synthesis" in result["missing_stages"]
    assert cancel_event.is_set()
