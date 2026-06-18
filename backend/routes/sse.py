from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, fields
from typing import Any

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
                            yield f"event: {event}\n".encode()
                        yield f"data: {data}\n\n".encode()
                    else:
                        yield str(item).encode("utf-8")

            super().__init__(encode_events(), media_type="text/event-stream")


from analysis_cache import AnalysisResultCache
from config import PIPELINE_TIMEOUT_SECONDS
from errors import ApiError, PipelineTimeoutError, error_payload, sanitize_message
from logging_config import request_id_ctx
from rate_limiter import RateLimitLease
from routes import pipeline_runner
from routes.event_contract import PipelineAgent, PipelineStatus, SseEvent
from routes.validation import AnalysisRequest

logger = logging.getLogger(__name__)

STREAM_PROGRESS_QUEUE_MAXSIZE = 128


def bounded_progress_queue() -> asyncio.Queue:
    return asyncio.Queue(maxsize=STREAM_PROGRESS_QUEUE_MAXSIZE)


def _is_terminal_stream_item(item: Any) -> bool:
    if item is None:
        return True
    if not isinstance(item, dict):
        return False
    event_type = item.get("event") or item.get("type")
    return event_type in {SseEvent.RESULT.value, SseEvent.ERROR.value}


def _drop_one_stream_item(queue: asyncio.Queue) -> bool:
    try:
        queue.get_nowait()
    except asyncio.QueueEmpty:
        return False
    try:
        queue.task_done()
    except ValueError:
        logger.debug("SSE progress queue task counter was already balanced")
    return True


async def put_stream_item(queue: asyncio.Queue, item: Any) -> None:
    try:
        queue.put_nowait(item)
        return
    except asyncio.QueueFull:
        pass

    is_terminal = _is_terminal_stream_item(item)
    while queue.full() and _drop_one_stream_item(queue):
        if not is_terminal:
            break

    try:
        queue.put_nowait(item)
    except asyncio.QueueFull:
        if is_terminal:
            await queue.put(item)
        else:
            logger.warning("Dropped SSE progress event because the client progress queue is full")


def sse_event(event: str, payload: dict) -> dict:
    return {"event": event, "data": json.dumps(payload)}


def sse_error(exc: Exception) -> dict:
    """Build a safe SSE error payload from any exception."""
    if isinstance(exc, ApiError):
        payload = error_payload(exc)
    elif isinstance(exc, asyncio.CancelledError):
        payload = {
            "request_id": request_id_ctx.get(),
            SseEvent.ERROR.value: {
                "code": "ANALYSIS_CANCELLED",
                "message": "Analysis was cancelled by the client.",
            },
        }
    else:
        payload = {
            "request_id": request_id_ctx.get(),
            SseEvent.ERROR.value: {
                "code": "PIPELINE_FAILED",
                "message": sanitize_message(
                    "Analysis failed. Check backend logs with the request_id."
                ),
            },
        }
    return sse_event(SseEvent.ERROR.value, payload)


@dataclass(slots=True)
class StreamPipelineContext:
    req: AnalysisRequest
    request_id: str
    queue: asyncio.Queue
    cancel_event: asyncio.Event | None = None
    preflight_market_data_func: Callable[[AnalysisRequest], Awaitable[None]] = (
        pipeline_runner.preflight_market_data
    )
    get_cancel_manager_func: Callable[[], Awaitable[Any]] = pipeline_runner.get_cancel_manager
    get_executor_func: Callable[[], Awaitable[Any]] = pipeline_runner.get_executor
    pipeline_worker_func: Callable[..., dict[str, Any]] = (
        pipeline_runner.run_pipeline_with_progress_worker
    )
    result_cache: AnalysisResultCache | None = None
    cache_key_func: Callable[[AnalysisRequest], Any] | None = None
    shape_result_func: Callable[[dict[str, Any], str], dict[str, Any]] | None = None
    with_data_fetched_at_func: Callable[[dict[str, Any]], dict[str, Any]] | None = None
    write_result_cache: bool = True
    run_preflight: bool = True


@dataclass(slots=True)
class StreamContext:
    request: Any
    req: AnalysisRequest
    request_id: str
    rate_limit_lease: RateLimitLease | None = None
    result_cache: AnalysisResultCache | None = None
    cache_key_func: Callable[[AnalysisRequest], Any] | None = None
    response_payload_func: Callable[[str, AnalysisRequest, dict], dict] | None = None
    run_stream_pipeline_func: Callable[..., Awaitable[dict[str, Any]]] | None = None
    get_or_start_analysis_func: Callable[..., Awaitable[dict[str, Any]]] | None = None
    use_cache: bool = False
    persist_result_func: (
        Callable[[dict[str, Any], AnalysisRequest, str | None, str | None], Awaitable[None]] | None
    ) = None
    use_deduplication: bool = True


def _apply_context_overrides(context: Any, overrides: dict[str, Any]) -> Any:
    valid_fields = {field.name for field in fields(context)}
    for name, value in overrides.items():
        if name not in valid_fields:
            raise TypeError(f"Unexpected stream context override: {name}")
        setattr(context, name, value)
    return context


def _coerce_stream_pipeline_context(
    context_or_req: StreamPipelineContext | AnalysisRequest,
    request_id: str | None,
    queue: asyncio.Queue | None,
    cancel_event: asyncio.Event | None,
    overrides: dict[str, Any],
) -> StreamPipelineContext:
    if isinstance(context_or_req, StreamPipelineContext):
        return _apply_context_overrides(context_or_req, overrides)
    if request_id is None or queue is None:
        raise TypeError("request_id and queue are required when passing AnalysisRequest")
    context = StreamPipelineContext(context_or_req, request_id, queue, cancel_event)
    return _apply_context_overrides(context, overrides)


def _require_stream_pipeline_dependencies(ctx: StreamPipelineContext) -> None:
    missing = [
        name
        for name in (
            "result_cache",
            "cache_key_func",
            "shape_result_func",
            "with_data_fetched_at_func",
        )
        if getattr(ctx, name) is None
    ]
    if missing:
        raise TypeError(f"Missing stream pipeline dependencies: {', '.join(missing)}")


async def _run_stream_preflight(ctx: StreamPipelineContext) -> None:
    if not ctx.run_preflight:
        return
    await put_stream_item(
        ctx.queue,
        {
            "type": SseEvent.PROGRESS.value,
            "payload": {
                "request_id": ctx.request_id,
                "ticker": ctx.req.ticker,
                "trade_date": ctx.req.trade_date,
                "agent_id": PipelineAgent.DATA_COLLECTION.value,
                "agent_name": "Data Collection",
                "status": PipelineStatus.STARTED.value,
                "status_message": "Preparing market data preflight...",
            },
        },
    )
    await ctx.preflight_market_data_func(ctx.req)


def _stream_worker_args(
    ctx: StreamPipelineContext, progress_queue: Any, worker_cancel_event: Any
) -> tuple[Any, ...]:
    req = ctx.req
    return (
        req.ticker,
        req.trade_date,
        req.time_horizon_months,
        req.max_debate_rounds,
        req.analysis_depth,
        req.response_detail,
        ctx.request_id,
        progress_queue,
        worker_cancel_event,
        req.has_existing_position if req.has_existing_position is not None else False,
        req.position_quantity,
        req.average_entry_price,
    )


def _start_stream_worker(
    ctx: StreamPipelineContext,
    executor: Any,
    progress_queue: Any,
    worker_cancel_event: Any,
) -> asyncio.Future:
    loop = asyncio.get_running_loop()
    return loop.run_in_executor(
        executor,
        ctx.pipeline_worker_func,
        *_stream_worker_args(ctx, progress_queue, worker_cancel_event),
    )


async def _pump_worker_progress(
    loop: asyncio.AbstractEventLoop,
    future: asyncio.Future,
    progress_queue: Any,
    queue: asyncio.Queue,
) -> None:
    empty_after_done = 0
    while True:
        try:
            item = await loop.run_in_executor(None, lambda: progress_queue.get(timeout=0.15))
        except Exception:
            if future.done():
                empty_after_done += 1
                if empty_after_done >= 5:
                    return
            else:
                empty_after_done = 0
            await asyncio.sleep(0)
            continue
        empty_after_done = 0
        await put_stream_item(queue, item)


async def _watch_stream_cancel(
    cancel_event: asyncio.Event | None,
    worker_cancel_event: Any,
    future: asyncio.Future,
) -> None:
    if cancel_event is None:
        return
    while not future.done():
        if cancel_event.is_set():
            pipeline_runner.set_cancel_event(worker_cancel_event)
            future.cancel()
            return
        await asyncio.sleep(0.2)


async def _wait_for_stream_worker(
    ctx: StreamPipelineContext,
    future: asyncio.Future,
    pump_task: asyncio.Task,
    cancel_task: asyncio.Task,
    worker_cancel_event: Any,
) -> dict[str, Any]:
    try:
        fields = await asyncio.wait_for(asyncio.shield(future), timeout=PIPELINE_TIMEOUT_SECONDS)
        try:
            await asyncio.wait_for(pump_task, timeout=2)
        except TimeoutError:
            logger.debug(
                "Timed out while draining worker progress queue",
                extra={"request_id": ctx.request_id},
            )
        return fields
    except TimeoutError:
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


def _shape_stream_pipeline_result(
    ctx: StreamPipelineContext, fields: dict[str, Any]
) -> dict[str, Any]:
    assert ctx.with_data_fetched_at_func is not None
    assert ctx.shape_result_func is not None
    fields = ctx.with_data_fetched_at_func(fields)
    return ctx.shape_result_func(fields, ctx.req.response_detail)


async def run_stream_pipeline(
    context: StreamPipelineContext | AnalysisRequest,
    request_id: str | None = None,
    queue: asyncio.Queue | None = None,
    cancel_event: asyncio.Event | None = None,
    **overrides: Any,
) -> dict[str, Any]:
    """Run a progress-capable pipeline and cache its final result."""
    ctx = _coerce_stream_pipeline_context(context, request_id, queue, cancel_event, overrides)
    _require_stream_pipeline_dependencies(ctx)
    await _run_stream_preflight(ctx)

    manager = await ctx.get_cancel_manager_func()
    progress_queue = manager.Queue()
    worker_cancel_event = manager.Event()
    executor = await ctx.get_executor_func()
    future = _start_stream_worker(ctx, executor, progress_queue, worker_cancel_event)
    loop = asyncio.get_running_loop()
    pump_task = asyncio.create_task(_pump_worker_progress(loop, future, progress_queue, ctx.queue))
    cancel_task = asyncio.create_task(
        _watch_stream_cancel(ctx.cancel_event, worker_cancel_event, future)
    )
    fields = await _wait_for_stream_worker(ctx, future, pump_task, cancel_task, worker_cancel_event)
    shaped = _shape_stream_pipeline_result(ctx, fields)
    if ctx.write_result_cache:
        assert ctx.result_cache is not None
        assert ctx.cache_key_func is not None
        await ctx.result_cache.set(ctx.cache_key_func(ctx.req), shaped)
    return shaped


def _coerce_stream_context(
    context_or_request: StreamContext | Any,
    req: AnalysisRequest | None,
    request_id: str | None,
    rate_limit_lease: RateLimitLease | None,
    overrides: dict[str, Any],
) -> StreamContext:
    if isinstance(context_or_request, StreamContext):
        return _apply_context_overrides(context_or_request, overrides)
    if req is None or request_id is None:
        raise TypeError("req and request_id are required when passing request")
    context = StreamContext(context_or_request, req, request_id, rate_limit_lease)
    return _apply_context_overrides(context, overrides)


def _require_stream_dependencies(ctx: StreamContext) -> None:
    missing = [
        name
        for name in (
            "result_cache",
            "cache_key_func",
            "response_payload_func",
            "run_stream_pipeline_func",
            "get_or_start_analysis_func",
        )
        if getattr(ctx, name) is None
    ]
    if missing:
        raise TypeError(f"Missing stream dependencies: {', '.join(missing)}")


async def _yield_cached_result(ctx: StreamContext, cached: dict[str, Any]):
    assert ctx.response_payload_func is not None
    payload = ctx.response_payload_func(ctx.request_id, ctx.req, cached)
    if ctx.persist_result_func is not None:
        owner_id = ctx.rate_limit_lease.identifier if ctx.rate_limit_lease is not None else None
        await ctx.persist_result_func(payload, ctx.req, None, owner_id)
    yield sse_event(
        SseEvent.PROGRESS.value,
        {
            "request_id": ctx.request_id,
            "ticker": ctx.req.ticker,
            "trade_date": ctx.req.trade_date,
            "agent_id": PipelineAgent.CACHE.value,
            "agent_name": "Analysis Cache",
            "status": PipelineStatus.COMPLETED.value,
            "status_message": "Returning cached analysis result.",
        },
    )
    yield sse_event(SseEvent.RESULT.value, payload)


async def _run_stream_result_job(
    ctx: StreamContext, queue: asyncio.Queue, cancel_event: asyncio.Event
) -> None:
    assert ctx.run_stream_pipeline_func is not None
    assert ctx.get_or_start_analysis_func is not None
    assert ctx.response_payload_func is not None
    try:

        async def factory() -> dict[str, Any]:
            return await ctx.run_stream_pipeline_func(ctx.req, ctx.request_id, queue, cancel_event)

        result_fields = await ctx.get_or_start_analysis_func(
            ctx.req,
            factory,
            use_cache=ctx.use_cache,
            use_deduplication=ctx.use_deduplication,
        )
        payload = ctx.response_payload_func(ctx.request_id, ctx.req, result_fields)
        if ctx.persist_result_func is not None:
            owner_id = ctx.rate_limit_lease.identifier if ctx.rate_limit_lease is not None else None
            await ctx.persist_result_func(payload, ctx.req, None, owner_id)
        await put_stream_item(queue, {"type": SseEvent.RESULT.value, "payload": payload})
    except TimeoutError:
        await put_stream_item(queue, sse_error(PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS)))
    except asyncio.CancelledError as exc:
        cancel_event.set()
        await put_stream_item(queue, sse_error(exc))
    except Exception as exc:
        if not isinstance(exc, ApiError):
            logger.error(
                "Streaming pipeline failed",
                extra={"event": "streaming_pipeline_failed", "request_id": ctx.request_id},
                exc_info=True,
            )
        await put_stream_item(queue, sse_error(exc))


def _initial_stream_progress(ctx: StreamContext) -> dict[str, Any]:
    return sse_event(
        SseEvent.PROGRESS.value,
        {
            "request_id": ctx.request_id,
            "ticker": ctx.req.ticker,
            "trade_date": ctx.req.trade_date,
            "agent_id": PipelineAgent.PIPELINE.value,
            "agent_name": "Analysis Pipeline",
            "status": PipelineStatus.STARTED.value,
            "status_message": "Starting analysis pipeline...",
        },
    )


def _heartbeat(ctx: StreamContext) -> dict[str, Any]:
    return sse_event(
        SseEvent.HEARTBEAT.value,
        {
            "request_id": ctx.request_id,
            "ticker": ctx.req.ticker,
            "trade_date": ctx.req.trade_date,
            "status": PipelineStatus.RUNNING.value,
        },
    )


async def _yield_live_stream(ctx: StreamContext):
    queue: asyncio.Queue[dict] = bounded_progress_queue()
    cancel_event = asyncio.Event()
    task = asyncio.create_task(_run_stream_result_job(ctx, queue, cancel_event))
    try:
        yield _initial_stream_progress(ctx)
        while True:
            if await ctx.request.is_disconnected():
                cancel_event.set()
                task.cancel()
                logger.info(
                    "SSE client disconnected",
                    extra={
                        "event": "sse_client_disconnected",
                        "request_id": ctx.request_id,
                        "ticker": ctx.req.ticker,
                    },
                )
                return
            try:
                item = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                yield _heartbeat(ctx)
                continue
            try:
                if "event" in item and "data" in item:
                    yield item
                    if item["event"] in {SseEvent.RESULT.value, SseEvent.ERROR.value}:
                        return
                    continue
                event_type = item["type"]
                yield sse_event(event_type, item["payload"])
                if event_type in {SseEvent.RESULT.value, SseEvent.ERROR.value}:
                    return
            finally:
                queue.task_done()
    finally:
        if not task.done():
            cancel_event.set()
            task.cancel()


async def stream_progress_and_result(
    context: StreamContext | Any,
    req: AnalysisRequest | None = None,
    request_id: str | None = None,
    rate_limit_lease: RateLimitLease | None = None,
    **overrides: Any,
):
    """Yield cached result, real progress events, heartbeats, then result."""
    ctx = _coerce_stream_context(context, req, request_id, rate_limit_lease, overrides)
    _require_stream_dependencies(ctx)
    assert ctx.result_cache is not None
    assert ctx.cache_key_func is not None
    key = ctx.cache_key_func(ctx.req)
    cached = await ctx.result_cache.get(key) if ctx.use_cache else None
    try:
        if cached is not None:
            async for event in _yield_cached_result(ctx, cached):
                yield event
            return
        async for event in _yield_live_stream(ctx):
            yield event
    finally:
        if ctx.rate_limit_lease is not None:
            await ctx.rate_limit_lease.__aexit__(None, None, None)
