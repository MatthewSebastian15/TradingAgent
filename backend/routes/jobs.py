from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

from analysis_cache import (
    AnalysisJob,
    AnalysisJobLimitError,
    AnalysisJobStore,
    AnalysisResultCache,
    InFlightRegistry,
)
from config import (
    ANALYSIS_JOB_MAX_ACTIVE,
    ANALYSIS_JOB_MAX_ENTRIES,
    ANALYSIS_JOB_EVENT_REPLAY_LIMIT,
    ANALYSIS_JOB_TTL_SECONDS,
    ANALYSIS_RESULT_CACHE_MAX_ENTRIES,
    ANALYSIS_RESULT_CACHE_TTL_SECONDS,
    PIPELINE_TIMEOUT_SECONDS,
)
from errors import ApiError, BadRequestError, PipelineExecutionError, PipelineTimeoutError, error_payload
from rate_limiter import RateLimitLease
from routes.sse import sse_event
from routes.validation import AnalysisRequest

logger = logging.getLogger(__name__)

RESULT_CACHE = AnalysisResultCache(
    ttl_seconds=ANALYSIS_RESULT_CACHE_TTL_SECONDS,
    max_entries=ANALYSIS_RESULT_CACHE_MAX_ENTRIES,
)
IN_FLIGHT = InFlightRegistry()
JOB_STORE = AnalysisJobStore(
    ttl_seconds=ANALYSIS_JOB_TTL_SECONDS,
    max_entries=ANALYSIS_JOB_MAX_ENTRIES,
    max_active_jobs=ANALYSIS_JOB_MAX_ACTIVE,
    max_event_history=ANALYSIS_JOB_EVENT_REPLAY_LIMIT,
)


async def get_or_start_analysis(
    req: AnalysisRequest,
    factory: Callable[[], Any],
    *,
    use_cache: bool,
    result_cache: AnalysisResultCache = RESULT_CACHE,
    in_flight: InFlightRegistry = IN_FLIGHT,
    cache_key_func: Callable[[AnalysisRequest], Any],
) -> dict[str, Any]:
    key = cache_key_func(req)
    if use_cache:
        cached = await result_cache.get(key)
        if cached is not None:
            return cached

    async def cached_factory() -> dict[str, Any]:
        fields = await factory()
        if use_cache:
            await result_cache.set(key, fields)
        return fields

    fields, _joined = await in_flight.run(key, cached_factory)
    return fields


def job_not_found(job_id: str) -> BadRequestError:
    return BadRequestError("Analysis job was not found.", details={"job_id": job_id})


async def forward_job_progress(job: AnalysisJob, source_queue: asyncio.Queue) -> None:
    while True:
        item = await source_queue.get()
        try:
            if item is None:
                return
            if job.status in {"completed", "failed", "cancelled"}:
                continue
            await job.publish(item["type"], item["payload"])
        finally:
            source_queue.task_done()


async def wait_for_job_progress(source_queue: asyncio.Queue) -> None:
    try:
        await asyncio.wait_for(source_queue.join(), timeout=2)
    except asyncio.TimeoutError:
        logger.debug("Timed out while waiting for job progress events to flush")


async def start_job(
    job: AnalysisJob,
    rate_limit_lease: RateLimitLease,
    *,
    result_cache: AnalysisResultCache,
    run_stream_pipeline_func: Callable[..., Awaitable[dict[str, Any]]],
    response_payload_func: Callable[[str, AnalysisRequest, dict], dict],
) -> None:
    progress_queue: asyncio.Queue = asyncio.Queue()
    progress_task = asyncio.create_task(forward_job_progress(job, progress_queue))
    try:
        req = AnalysisRequest(**job.payload)
        cached = await result_cache.get(job.cache_key)
        if cached is not None:
            await job.complete(response_payload_func(job.request_id, req, cached))
            return

        if not await job.mark_running():
            return

        fields = await run_stream_pipeline_func(req, job.request_id, progress_queue, job.cancel_event)
        await wait_for_job_progress(progress_queue)
        if job.cancel_event.is_set():
            raise asyncio.CancelledError()
        await job.complete(response_payload_func(job.request_id, req, fields))
    except asyncio.CancelledError:
        await wait_for_job_progress(progress_queue)
        await job.cancel({"request_id": job.request_id, "error": {"code": "ANALYSIS_CANCELLED", "message": "Analysis was cancelled by the client."}})
    except asyncio.TimeoutError:
        exc = PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS)
        await wait_for_job_progress(progress_queue)
        await job.fail(error_payload(exc))
    except Exception as exc:
        await wait_for_job_progress(progress_queue)
        if isinstance(exc, ApiError):
            await job.fail(error_payload(exc))
        else:
            logger.error("Analysis job failed", extra={"event": "analysis_job_failed", "job_id": job.id}, exc_info=True)
            await job.fail(error_payload(PipelineExecutionError(internal_message=str(exc))))
    finally:
        await progress_queue.put(None)
        try:
            await asyncio.wait_for(progress_task, timeout=2)
        except asyncio.TimeoutError:
            progress_task.cancel()
        job.updated_at = time.time()
        await rate_limit_lease.__aexit__(None, None, None)


async def stream_job_events_with_lease(request, job: AnalysisJob, rate_limit_lease: RateLimitLease):
    try:
        async for event in stream_job_events(request, job):
            yield event
    finally:
        await rate_limit_lease.__aexit__(None, None, None)


async def stream_job_events(request, job: AnalysisJob):
    yield sse_event("job", job.public_summary())

    next_sequence = 0
    while True:
        events = await job.events_since(next_sequence)
        for item in events:
            next_sequence = item["sequence"] + 1
            yield sse_event(item["type"], item["payload"])
            if item["type"] in {"result", "error"}:
                return

        if job.result is not None:
            yield sse_event("result", job.result)
            return
        if job.error is not None:
            yield sse_event("error", job.error)
            return
        if job.done_event.is_set():
            return

        if await request.is_disconnected():
            return

        try:
            async with job.event_condition:
                has_pending_events = any(item["sequence"] >= next_sequence for item in job.events)
                if not has_pending_events and not job.done_event.is_set():
                    await asyncio.wait_for(job.event_condition.wait(), timeout=15)
        except asyncio.TimeoutError:
            yield sse_event("heartbeat", {"job_id": job.id, "request_id": job.request_id, "status": job.status})
