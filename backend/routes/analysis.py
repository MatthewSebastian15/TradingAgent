from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Request

from analysis_cache import AnalysisJobLimitError
from config import DEFAULT_ANALYSIS_DEPTH, llm
from errors import RateLimitError, sanitize_message
from logging_config import request_id_ctx
from rate_limiter import limit_request, request_policy, stream_policy
from routes import jobs, pipeline_runner, serializers, sse
from routes.sse import EventSourceResponse
from routes.validation import AnalysisRequest, normalize_and_validate_analysis_request

router = APIRouter()

_RESULT_CACHE = jobs.RESULT_CACHE
_IN_FLIGHT = jobs.IN_FLIGHT
_JOB_STORE = jobs.JOB_STORE

_parse_final_result = serializers.parse_final_result
_cache_key = serializers.cache_key
_shape_result = serializers.shape_result
_with_data_fetched_at = serializers.with_data_fetched_at
_request_warnings = serializers.request_warnings
_response_payload = serializers.response_payload
_log_request_accepted = serializers.log_request_accepted

_sse_event = sse.sse_event
_sse_error = sse.sse_error


def _run_pipeline(*args, **kwargs):
    return pipeline_runner.run_pipeline(*args, **kwargs)


def _run_pipeline_with_progress(*args, **kwargs):
    return pipeline_runner.run_pipeline_with_progress(*args, **kwargs)


def _run_pipeline_with_progress_worker(*args, **kwargs):
    return pipeline_runner.run_pipeline_with_progress_worker(*args, **kwargs)


def _preflight_market_data_worker(*args, **kwargs):
    return pipeline_runner.preflight_market_data_worker(*args, **kwargs)


async def _get_executor():
    return await pipeline_runner.get_executor()


async def _get_cancel_manager():
    return await pipeline_runner.get_cancel_manager()


async def _new_cancel_event():
    return await pipeline_runner.new_cancel_event()


def _is_cancel_event_set(cancel_event: Any | None) -> bool:
    return pipeline_runner.is_cancel_event_set(cancel_event)


def _set_cancel_event(cancel_event: Any | None) -> None:
    pipeline_runner.set_cancel_event(cancel_event)


async def _watch_request_disconnect(*args, **kwargs) -> None:
    await pipeline_runner.watch_request_disconnect(*args, **kwargs)


async def shutdown_executor() -> None:
    await pipeline_runner.shutdown_executor()


async def _run_pipeline_async(req: AnalysisRequest, request_id: str, request: Request | None = None) -> dict:
    return await pipeline_runner.run_pipeline_async(
        req,
        request_id,
        request=request,
        get_executor_func=_get_executor,
        new_cancel_event_func=_new_cancel_event,
        run_pipeline_func=_run_pipeline,
        set_cancel_event_func=_set_cancel_event,
        watch_request_disconnect_func=_watch_request_disconnect,
    )


async def _preflight_market_data(req: AnalysisRequest) -> None:
    await pipeline_runner.preflight_market_data(
        req,
        get_executor_func=_get_executor,
        preflight_worker_func=_preflight_market_data_worker,
    )


def _is_default_callable(func: Callable[..., Any], name: str) -> bool:
    return getattr(func, "__module__", "") == __name__ and getattr(func, "__name__", "") == name


async def _call_run_pipeline_async(req: AnalysisRequest, request_id: str, request: Request | None) -> dict[str, Any]:
    if _is_default_callable(_run_pipeline_async, "_run_pipeline_async"):
        return await _run_pipeline_async(req, request_id, request=request)
    return await _run_pipeline_async(req, request_id)


async def _compute_result_fields(
    req: AnalysisRequest, request_id: str, request: Request | None = None
) -> dict[str, Any]:
    if _is_default_callable(_run_pipeline_async, "_run_pipeline_async"):
        await _preflight_market_data(req)
    result_fields = await _call_run_pipeline_async(req, request_id, request)
    result_fields = _with_data_fetched_at(result_fields)
    return _shape_result(result_fields, req.response_detail)


async def _get_or_start_analysis(
    req: AnalysisRequest,
    factory: Callable[[], Any],
    *,
    use_cache: bool,
) -> dict[str, Any]:
    return await jobs.get_or_start_analysis(
        req,
        factory,
        use_cache=use_cache,
        result_cache=_RESULT_CACHE,
        in_flight=_IN_FLIGHT,
        cache_key_func=_cache_key,
    )


async def _execute_analysis(
    request: Request,
    req: AnalysisRequest,
    request_id: str,
    policy,
) -> dict:
    """Run cached/deduplicated JSON analysis."""
    use_cache = _is_default_callable(_run_pipeline_async, "_run_pipeline_async")
    async with limit_request(request, policy):

        async def factory() -> dict[str, Any]:
            return await _compute_result_fields(req, request_id, request)

        fields = await _get_or_start_analysis(req, factory, use_cache=use_cache)
        return _response_payload(request_id, req, fields)


async def _run_stream_pipeline(
    req: AnalysisRequest,
    request_id: str,
    queue: asyncio.Queue,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    return await sse.run_stream_pipeline(
        req,
        request_id,
        queue,
        cancel_event,
        preflight_market_data_func=_preflight_market_data,
        get_cancel_manager_func=_get_cancel_manager,
        get_executor_func=_get_executor,
        pipeline_worker_func=_run_pipeline_with_progress_worker,
        result_cache=_RESULT_CACHE,
        cache_key_func=_cache_key,
        shape_result_func=_shape_result,
        with_data_fetched_at_func=_with_data_fetched_at,
    )


async def _stream_progress_and_result(
    request: Request,
    req: AnalysisRequest,
    request_id: str,
    rate_limit_lease=None,
):
    use_cache = _is_default_callable(
        _run_pipeline_with_progress, "_run_pipeline_with_progress"
    ) and _is_default_callable(_run_stream_pipeline, "_run_stream_pipeline")
    async for event in sse.stream_progress_and_result(
        request,
        req,
        request_id,
        rate_limit_lease,
        result_cache=_RESULT_CACHE,
        cache_key_func=_cache_key,
        response_payload_func=_response_payload,
        run_stream_pipeline_func=_run_stream_pipeline,
        get_or_start_analysis_func=_get_or_start_analysis,
        use_cache=use_cache,
    ):
        yield event


def _job_not_found(job_id: str):
    return jobs.job_not_found(job_id)


async def _forward_job_progress(job, source_queue: asyncio.Queue) -> None:
    await jobs.forward_job_progress(job, source_queue)


async def _wait_for_job_progress(source_queue: asyncio.Queue) -> None:
    await jobs.wait_for_job_progress(source_queue)


async def _start_job(job, rate_limit_lease) -> None:
    await jobs.start_job(
        job,
        rate_limit_lease,
        result_cache=_RESULT_CACHE,
        run_stream_pipeline_func=_run_stream_pipeline,
        response_payload_func=_response_payload,
    )


async def _stream_job_events_with_lease(request: Request, job, rate_limit_lease):
    async for event in jobs.stream_job_events_with_lease(request, job, rate_limit_lease):
        yield event


async def _stream_job_events(request: Request, job):
    async for event in jobs.stream_job_events(request, job):
        yield event


@router.post("/analyze/stream")
async def analyze_stream(req: AnalysisRequest, request: Request):
    """SSE endpoint with cache hit shortcut, heartbeat, and cancellation on disconnect."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()
    rate_limit_lease = limit_request(request, stream_policy())
    await rate_limit_lease.__aenter__()
    _log_request_accepted("stream", request_id, req)
    return EventSourceResponse(_stream_progress_and_result(request, req, request_id, rate_limit_lease))


@router.post("/analyze")
async def analyze(req: AnalysisRequest, request: Request):
    """Standard JSON endpoint with final-result cache and in-flight de-duplication."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()
    _log_request_accepted("request", request_id, req)
    return await _execute_analysis(request, req, request_id, request_policy())


@router.post("/analysis/jobs")
async def create_analysis_job(req: AnalysisRequest, request: Request):
    """Create a cancellable analysis job and return its job_id immediately."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()

    rate_limit_lease = limit_request(request, stream_policy())
    await rate_limit_lease.__aenter__()
    release_lease = True
    try:
        job = await _JOB_STORE.create(
            owner_id=rate_limit_lease.identifier,
            request_id=request_id,
            cache_key=_cache_key(req),
            payload=req.model_dump(),
        )
        job.task = asyncio.create_task(_start_job(job, rate_limit_lease))
        release_lease = False
        _log_request_accepted("job", request_id, req)
    except AnalysisJobLimitError as exc:
        raise RateLimitError(
            "Too many analysis jobs are already queued or running.",
            details={"max_active_jobs": exc.max_active_jobs},
        ) from exc
    finally:
        if release_lease:
            await rate_limit_lease.__aexit__(None, None, None)

    return {
        "job_id": job.id,
        "request_id": request_id,
        "status": job.status,
        "events_url": f"/api/analysis/jobs/{job.id}/events",
    }


@router.get("/analysis/jobs/{job_id}")
async def get_analysis_job(job_id: str, request: Request):
    async with limit_request(request, request_policy()) as lease:
        job = await _JOB_STORE.get(job_id, owner_id=lease.identifier)
        if job is None:
            raise _job_not_found(job_id)
        return job.public_summary()


@router.get("/analysis/jobs/{job_id}/events")
async def analysis_job_events(job_id: str, request: Request):
    rate_limit_lease = limit_request(request, request_policy())
    await rate_limit_lease.__aenter__()
    try:
        job = await _JOB_STORE.get(job_id, owner_id=rate_limit_lease.identifier)
        if job is None:
            raise _job_not_found(job_id)
    except BaseException:
        await rate_limit_lease.__aexit__(None, None, None)
        raise
    return EventSourceResponse(_stream_job_events_with_lease(request, job, rate_limit_lease))


@router.delete("/analysis/jobs/{job_id}")
async def cancel_analysis_job(job_id: str, request: Request):
    async with limit_request(request, request_policy()) as lease:
        job = await _JOB_STORE.cancel(job_id, owner_id=lease.identifier)
        if job is None:
            raise _job_not_found(job_id)
        return job.public_summary()


@router.delete("/analysis/{job_id}")
async def cancel_analysis_job_alias(job_id: str, request: Request):
    """Compatibility alias for cancellation endpoint."""
    return await cancel_analysis_job(job_id, request)


@router.get("/ticker/validate")
async def validate_ticker(ticker: str, trade_date: str, request: Request, market: str | None = None):
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(
            ticker=ticker,
            trade_date=trade_date,
            max_debate_rounds=1,
            analysis_depth="fast",
            response_detail="summary",
            market=market,
        )
    )
    async with limit_request(request, request_policy()):
        await _preflight_market_data(req)
    return {
        "ticker": req.ticker,
        "trade_date": req.trade_date,
        "valid": True,
        "message": "Ticker has usable market data.",
    }


@router.get("/status")
async def api_status(request: Request):
    async with limit_request(request, request_policy()):
        return await _api_status_payload()


async def _api_status_payload():
    try:
        from tradingagents.dataflows.interface import get_tool_cache_stats

        tool_cache = get_tool_cache_stats()
    except Exception as exc:  # pragma: no cover - useful when optional vendor deps are absent
        tool_cache = {"backend": "unavailable", "error": sanitize_message(str(exc))}

    try:
        from tradingagents.utils_resilience import get_circuit_states, get_timeout_stats

        circuits = get_circuit_states()
        timeout_workers = get_timeout_stats()
    except Exception as exc:  # pragma: no cover
        circuits = {"error": sanitize_message(str(exc))}
        timeout_workers = {"error": sanitize_message(str(exc))}

    cache_stats = await _RESULT_CACHE.stats()
    inflight_stats = await _IN_FLIGHT.stats()
    job_stats = await _JOB_STORE.stats()
    return {
        "provider": llm.provider,
        "quick_model": llm.quick_think_llm,
        "deep_model": llm.deep_think_llm,
        "analysis_mode": "balanced",
        "default_analysis_depth": DEFAULT_ANALYSIS_DEPTH,
        "limits": {
            "pipeline_timeout_seconds": pipeline_runner.PIPELINE_TIMEOUT_SECONDS,
        },
        "result_cache": cache_stats,
        "in_flight": inflight_stats,
        "jobs": job_stats,
        "tool_cache": tool_cache,
        "circuits": circuits,
        "timeout_workers": timeout_workers,
    }
