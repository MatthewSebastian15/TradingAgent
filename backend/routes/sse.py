from __future__ import annotations

import asyncio
import json
import logging
import queue as thread_queue
from typing import Any, Awaitable, Callable

try:
    from sse_starlette.sse import EventSourceResponse
except ModuleNotFoundError:  # pragma: no cover - exercised when optional dependency is absent
    from starlette.responses import StreamingResponse

    class EventSourceResponse(StreamingResponse):
        """Small SSE-compatible fallback for local tests/dev."""

        def __init__(self, content, *args, **kwargs):
            async def encode_events():
                async for item in content:
                    if isinstance(item, dict):
                        event = item.get("event")
                        data = item.get("data", "")
                        if event:
                            yield f"event: {event}\n".encode("utf-8")
                        yield f"data: {data}\n\n".encode("utf-8")
                    else:
                        yield str(item).encode("utf-8")

            super().__init__(encode_events(), media_type="text/event-stream")

from analysis_cache import AnalysisResultCache
from config import PIPELINE_TIMEOUT_SECONDS
from errors import ApiError, PipelineTimeoutError, error_payload, sanitize_message
from logging_config import request_id_ctx
from rate_limiter import RateLimitLease
from routes import pipeline_runner
from routes.validation import AnalysisRequest

logger = logging.getLogger(__name__)


def sse_event(event: str, payload: dict) -> dict:
    return {"event": event, "data": json.dumps(payload)}


def sse_error(exc: Exception) -> dict:
    """Build a safe SSE error payload from any exception."""
    if isinstance(exc, ApiError):
        payload = error_payload(exc)
    elif isinstance(exc, asyncio.CancelledError):
        payload = {
            "request_id": request_id_ctx.get(),
            "error": {"code": "ANALYSIS_CANCELLED", "message": "Analysis was cancelled by the client."},
        }
    else:
        payload = {
            "request_id": request_id_ctx.get(),
            "error": {
                "code": "PIPELINE_FAILED",
                "message": sanitize_message("Analysis failed. Check backend logs with the request_id."),
            },
        }
    return sse_event("error", payload)


async def run_stream_pipeline(
    req: AnalysisRequest,
    request_id: str,
    queue: asyncio.Queue,
    cancel_event: asyncio.Event | None = None,
    *,
    preflight_market_data_func: Callable[[AnalysisRequest], Awaitable[None]] = pipeline_runner.preflight_market_data,
    get_cancel_manager_func: Callable[[], Awaitable[Any]] = pipeline_runner.get_cancel_manager,
    get_executor_func: Callable[[], Awaitable[Any]] = pipeline_runner.get_executor,
    pipeline_worker_func: Callable[..., dict[str, Any]] = pipeline_runner.run_pipeline_with_progress_worker,
    result_cache: AnalysisResultCache,
    cache_key_func: Callable[[AnalysisRequest], Any],
    shape_result_func: Callable[[dict[str, Any], str], dict[str, Any]],
    with_data_fetched_at_func: Callable[[dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    """Run a progress-capable pipeline and cache its final result."""
    loop = asyncio.get_running_loop()

    await queue.put(
        {
            "type": "progress",
            "payload": {
                "request_id": request_id,
                "ticker": req.ticker,
                "trade_date": req.trade_date,
                "agent_id": "data_collection",
                "agent_name": "Data Collection",
                "status": "started",
                "status_message": "Preparing market data preflight...",
            },
        }
    )
    await preflight_market_data_func(req)

    manager = await get_cancel_manager_func()
    progress_queue = manager.Queue()
    worker_cancel_event = manager.Event()
    executor = await get_executor_func()
    future = loop.run_in_executor(
        executor,
        pipeline_worker_func,
        req.ticker,
        req.trade_date,
        req.max_debate_rounds,
        req.analysis_depth,
        req.response_detail,
        request_id,
        progress_queue,
        worker_cancel_event,
    )

    async def pump_progress() -> None:
        # progress_queue is a multiprocessing.managers.AutoProxy[Queue].
        # Calling .get() on it (even with block=False) performs an IPC round-trip
        # to the manager server, which can stall the asyncio event loop for
        # several milliseconds and cause progress events to be delayed.
        # We therefore run each .get() in the default thread-pool executor so
        # the event loop stays free to serve other coroutines (forward_job_progress,
        # stream_job_events, etc.) while we wait for worker events.
        empty_after_done = 0
        while True:
            try:
                item = await loop.run_in_executor(
                    None, lambda: progress_queue.get(timeout=0.15)
                )
            except Exception:
                # Covers queue.Empty, RemoteError, and any IPC hiccup.
                if future.done():
                    empty_after_done += 1
                    if empty_after_done >= 5:
                        return
                else:
                    empty_after_done = 0
                await asyncio.sleep(0)
                continue
            empty_after_done = 0
            await queue.put(item)

    async def watch_cancel() -> None:
        if cancel_event is None:
            return
        while not future.done():
            if cancel_event.is_set():
                pipeline_runner.set_cancel_event(worker_cancel_event)
                future.cancel()
                return
            await asyncio.sleep(0.2)

    pump_task = asyncio.create_task(pump_progress())
    cancel_task = asyncio.create_task(watch_cancel())
    try:
        fields = await asyncio.wait_for(asyncio.shield(future), timeout=PIPELINE_TIMEOUT_SECONDS)
        try:
            await asyncio.wait_for(pump_task, timeout=2)
        except asyncio.TimeoutError:
            logger.debug("Timed out while draining worker progress queue", extra={"request_id": request_id})
    except asyncio.TimeoutError:
        pipeline_runner.set_cancel_event(worker_cancel_event)
        future.cancel()
        raise
    except asyncio.CancelledError:
        pipeline_runner.set_cancel_event(worker_cancel_event)
        future.cancel()
        raise
    finally:
        for task in (pump_task, cancel_task):
            if not task.done():
                task.cancel()

    fields = with_data_fetched_at_func(fields)
    shaped = shape_result_func(fields, req.response_detail)
    await result_cache.set(cache_key_func(req), shaped)
    return shaped


async def stream_progress_and_result(
    request,
    req: AnalysisRequest,
    request_id: str,
    rate_limit_lease: RateLimitLease | None = None,
    *,
    result_cache: AnalysisResultCache,
    cache_key_func: Callable[[AnalysisRequest], Any],
    response_payload_func: Callable[[str, AnalysisRequest, dict], dict],
    run_stream_pipeline_func: Callable[..., Awaitable[dict[str, Any]]],
    get_or_start_analysis_func: Callable[..., Awaitable[dict[str, Any]]],
    use_cache: bool,
):
    """Yield cached result, real progress events, heartbeats, then result."""
    key = cache_key_func(req)
    cached = await result_cache.get(key) if use_cache else None
    try:
        if cached is not None:
            yield sse_event(
                "progress",
                {
                    "request_id": request_id,
                    "ticker": req.ticker,
                    "trade_date": req.trade_date,
                    "agent_id": "cache",
                    "agent_name": "Analysis Cache",
                    "status": "completed",
                    "status_message": "Returning cached analysis result.",
                },
            )
            yield sse_event("result", response_payload_func(request_id, req, cached))
            return

        queue: asyncio.Queue[dict] = asyncio.Queue()
        cancel_event = asyncio.Event()

        async def runner() -> None:
            try:
                async def factory() -> dict[str, Any]:
                    return await run_stream_pipeline_func(req, request_id, queue, cancel_event)

                result_fields = await get_or_start_analysis_func(req, factory, use_cache=use_cache)
                await queue.put({"type": "result", "payload": response_payload_func(request_id, req, result_fields)})
            except asyncio.TimeoutError:
                await queue.put(sse_error(PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS)))
            except asyncio.CancelledError as exc:
                cancel_event.set()
                await queue.put(sse_error(exc))
            except Exception as exc:
                if not isinstance(exc, ApiError):
                    logger.error(
                        "Streaming pipeline failed",
                        extra={"event": "streaming_pipeline_failed", "request_id": request_id},
                        exc_info=True,
                    )
                await queue.put(sse_error(exc))

        task = asyncio.create_task(runner())
        try:
            yield sse_event(
                "progress",
                {
                    "request_id": request_id,
                    "ticker": req.ticker,
                    "trade_date": req.trade_date,
                    "agent_id": "pipeline",
                    "agent_name": "Analysis Pipeline",
                    "status": "started",
                    "status_message": "Starting analysis pipeline...",
                },
            )

            while True:
                if await request.is_disconnected():
                    cancel_event.set()
                    task.cancel()
                    logger.info(
                        "SSE client disconnected",
                        extra={"event": "sse_client_disconnected", "request_id": request_id, "ticker": req.ticker},
                    )
                    return

                try:
                    item = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield sse_event(
                        "heartbeat",
                        {
                            "request_id": request_id,
                            "ticker": req.ticker,
                            "trade_date": req.trade_date,
                            "status": "running",
                        },
                    )
                    continue

                if "event" in item and "data" in item:
                    yield item
                    if item["event"] in {"result", "error"}:
                        return
                    continue

                event_type = item["type"]
                yield sse_event(event_type, item["payload"])
                if event_type in {"result", "error"}:
                    return
        finally:
            if not task.done():
                cancel_event.set()
                task.cancel()
    finally:
        if rate_limit_lease is not None:
            await rate_limit_lease.__aexit__(None, None, None)
