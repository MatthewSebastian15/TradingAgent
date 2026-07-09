from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from fastapi import Request

from analysis_cache import (
    AnalysisJob,
    AnalysisJobStore,
    AnalysisResultCache,
    InFlightRegistry,
)
from config import (
    ANALYSIS_JOB_CACHE_DB_PATH,
    ANALYSIS_JOB_EVENT_REPLAY_LIMIT,
    ANALYSIS_JOB_MAX_ACTIVE,
    ANALYSIS_JOB_MAX_ENTRIES,
    ANALYSIS_JOB_STORE_BACKEND,
    ANALYSIS_JOB_TTL_SECONDS,
    ANALYSIS_RESULT_CACHE_MAX_ENTRIES,
    ANALYSIS_RESULT_CACHE_TTL_SECONDS,
    PIPELINE_TIMEOUT_SECONDS,
)
from errors import (
    ApiError,
    BadRequestError,
    PipelineExecutionError,
    PipelineTimeoutError,
    error_payload,
)
from rate_limiter import RateLimitLease
from routes.sse import bounded_progress_queue, put_stream_item, sse_event
from routes.validation import AnalysisRequest
from storage_backends import build_runtime_storage

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AnalysisRuntimeState:
    """Runtime-owned caches and stores for analysis requests."""

    result_cache: AnalysisResultCache
    in_flight: InFlightRegistry
    job_store: AnalysisJobStore


def create_analysis_runtime() -> AnalysisRuntimeState:
    storage = build_runtime_storage(ANALYSIS_JOB_STORE_BACKEND)
    return AnalysisRuntimeState(
        result_cache=AnalysisResultCache(
            ttl_seconds=ANALYSIS_RESULT_CACHE_TTL_SECONDS,
            max_entries=ANALYSIS_RESULT_CACHE_MAX_ENTRIES,
        ),
        in_flight=InFlightRegistry(),
        job_store=AnalysisJobStore(
            ttl_seconds=ANALYSIS_JOB_TTL_SECONDS,
            max_entries=ANALYSIS_JOB_MAX_ENTRIES,
            max_active_jobs=ANALYSIS_JOB_MAX_ACTIVE,
            max_event_history=ANALYSIS_JOB_EVENT_REPLAY_LIMIT,
            persistent_cache=storage.ttl_cache(
                ANALYSIS_JOB_CACHE_DB_PATH,
                ttl_seconds=ANALYSIS_JOB_TTL_SECONDS,
                max_entries=ANALYSIS_JOB_MAX_ENTRIES * 2,
            ),
            persist_active_jobs=True,
        ),
    )


_RUNTIME = create_analysis_runtime()

# Compatibility aliases for existing route code and tests. New code should get
# state from get_analysis_runtime() so tests can replace the whole container.
RESULT_CACHE = _RUNTIME.result_cache
IN_FLIGHT = _RUNTIME.in_flight
JOB_STORE = _RUNTIME.job_store


def get_analysis_runtime(request: Request | None = None) -> AnalysisRuntimeState:
    if request is not None:
        runtime = getattr(request.app.state, "analysis_runtime", None)
        if isinstance(runtime, AnalysisRuntimeState):
            return runtime
    return _RUNTIME


def install_analysis_runtime(runtime: AnalysisRuntimeState) -> AnalysisRuntimeState:
    global _RUNTIME, RESULT_CACHE, IN_FLIGHT, JOB_STORE
    _RUNTIME = runtime
    RESULT_CACHE = runtime.result_cache
    IN_FLIGHT = runtime.in_flight
    JOB_STORE = runtime.job_store
    return runtime


def reset_analysis_runtime_for_tests() -> AnalysisRuntimeState:
    """Replace analysis runtime state for deterministic tests."""
    return install_analysis_runtime(create_analysis_runtime())


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
    except TimeoutError:
        logger.debug("Timed out while waiting for job progress events to flush")


async def start_job(
    job: AnalysisJob,
    *,
    result_cache: AnalysisResultCache,
    run_stream_pipeline_func: Callable[..., Awaitable[dict[str, Any]]],
    response_payload_func: Callable[[str, AnalysisRequest, dict], dict],
    use_cache: bool = True,
    persist_result_func: Callable[
        [dict[str, Any], AnalysisRequest, str | None, str | None], Awaitable[None]
    ]
    | None = None,
) -> None:
    progress_queue: asyncio.Queue = bounded_progress_queue()
    progress_task = asyncio.create_task(forward_job_progress(job, progress_queue))
    try:
        req = AnalysisRequest(**job.payload)
        cached = await result_cache.get(job.cache_key) if use_cache else None
        if cached is not None:
            payload = {**response_payload_func(job.request_id, req, cached), "job_id": job.id}
            await job.complete(payload)
            if persist_result_func is not None:
                await persist_result_func(payload, req, job.id, job.owner_id)
            return

        if not await job.mark_running():
            return

        fields = await run_stream_pipeline_func(
            req, job.request_id, progress_queue, job.cancel_event
        )
        await wait_for_job_progress(progress_queue)
        if job.cancel_event.is_set():
            raise asyncio.CancelledError()
        payload = {**response_payload_func(job.request_id, req, fields), "job_id": job.id}
        await job.complete(payload)
        if persist_result_func is not None:
            await persist_result_func(payload, req, job.id, job.owner_id)
    except asyncio.CancelledError:
        await wait_for_job_progress(progress_queue)
        await job.cancel(
            {
                "request_id": job.request_id,
                "error": {
                    "code": "ANALYSIS_CANCELLED",
                    "message": "Analysis was cancelled by the client.",
                },
            }
        )
    except TimeoutError:
        exc = PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS)
        await wait_for_job_progress(progress_queue)
        await job.fail(error_payload(exc))
    except Exception as exc:
        await wait_for_job_progress(progress_queue)
        if isinstance(exc, ApiError):
            await job.fail(error_payload(exc))
        else:
            logger.error(
                "Analysis job failed",
                extra={"event": "analysis_job_failed", "job_id": job.id},
                exc_info=True,
            )
            await job.fail(error_payload(PipelineExecutionError(internal_message=str(exc))))
    finally:
        await put_stream_item(progress_queue, None)
        try:
            await asyncio.wait_for(progress_task, timeout=2)
        except TimeoutError:
            progress_task.cancel()
        job.updated_at = time.time()


async def stream_job_events_with_lease(request, job: AnalysisJob, rate_limit_lease: RateLimitLease):
    try:
        async for event in stream_job_events(request, job):
            await rate_limit_lease.touch()
            yield event
    finally:
        await rate_limit_lease.__aexit__(None, None, None)


async def stream_job_events(request, job: AnalysisJob):
    yield sse_event("job", job.public_summary())

    next_sequence = 0
    while True:
        # If a subscriber attaches after completion and there is no replayable
        # history, send the terminal payload immediately instead of waiting for
        # the heartbeat timeout.
        if job.result is not None and next_sequence == 0 and not job.events:
            yield sse_event("result", job.result)
            return
        if job.error is not None and next_sequence == 0 and not job.events:
            yield sse_event("error", job.error)
            return

        # Acquire the condition lock once and do BOTH the event check and the
        # wait() inside it. This eliminates the race where publish() fires a
        # notify_all() between our events_since() call and our wait() call,
        # which previously caused progress events to be missed for up to 15 s.
        try:
            async with job.event_condition:
                # Drain any events that arrived before we acquired the lock.
                pending = [e for e in job.events if e["sequence"] >= next_sequence]
                if not pending and not job.done_event.is_set():
                    # No events yet — wait for the next notify_all().
                    await asyncio.wait_for(job.event_condition.wait(), timeout=15)
                    pending = [e for e in job.events if e["sequence"] >= next_sequence]
        except TimeoutError:
            yield sse_event(
                "heartbeat", {"job_id": job.id, "request_id": job.request_id, "status": job.status}
            )
            pending = []

        for item in pending:
            next_sequence = item["sequence"] + 1
            yield sse_event(item["type"], item["payload"])
            if item["type"] in {"result", "error"}:
                return

        if job.done_event.is_set() and not pending:
            # Job finished but we may have already consumed the result/error event above.
            return

        if await request.is_disconnected():
            return
