from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Request

from analysis_cache import AnalysisJobLimitError
from config import ANALYSIS_MODE, DEFAULT_ANALYSIS_DEPTH, QUANT_RISK_FREE_RATE, llm
from errors import RateLimitError, sanitize_message
from logging_config import request_id_ctx
from rate_limiter import (
    analysis_read_policy,
    limit_request,
    request_policy,
    status_policy,
    stream_policy,
)
from routes import jobs, pipeline_runner, sse
from routes import serializers_analysis as serializers
from routes.sse import EventSourceResponse
from routes.validation import (
    AnalysisRequest,
    normalize_and_validate_analysis_request,
    normalize_market,
    normalize_ticker_for_market,
)
from schemas import (
    AnalysisJobCreateResponse,
    AnalysisJobSummaryResponse,
    ApiStatusResponse,
    TickerValidationResponse,
)
from services.analysis_repository import get_analysis_repository

router = APIRouter()
logger = logging.getLogger(__name__)


_parse_final_result = serializers.parse_final_result
_cache_key = serializers.cache_key
_shape_result = serializers.shape_result
_with_data_fetched_at = serializers.with_data_fetched_at
_request_warnings = serializers.request_warnings
_response_payload = serializers.response_payload
_log_request_accepted = serializers.log_request_accepted


# Public aliases kept in this route module for tests and route-level callers.
def normalize_ticker(ticker: str, market: str | None) -> str:
    """Normalize a user ticker before analysis work starts."""
    return normalize_ticker_for_market(ticker, normalize_market(market))


resolve_display_signal = serializers.resolve_display_signal
get_confidence_label = serializers.get_confidence_label
sanitize_text = serializers.sanitize_text
get_market_status = serializers.get_market_status

_sse_event = sse.sse_event
_sse_error = sse.sse_error


@dataclass(frozen=True)
class AnalysisRouteDependencies:
    """Explicit feature switches for analysis routes.

    These flags avoid inferring runtime behavior from callable names/modules,
    which breaks under decorators, monkeypatching, and refactors.
    """

    run_preflight: bool = True
    enable_result_cache: bool = True
    enable_cache_deduplication: bool = True


ROUTE_DEPS = AnalysisRouteDependencies()


async def _save_analysis_result_async(
    result: dict[str, Any],
    req: AnalysisRequest,
    job_id: str | None = None,
    owner_id: str | None = None,
) -> None:
    """Persist a completed result without making analysis delivery depend on SQLite."""

    if not isinstance(result, dict) or result.get("error"):
        return
    try:
        from tradingagents.llm_optimization.usage import ingest_analysis_telemetry

        ingest_analysis_telemetry(
            result.get("llm_usage"),
            ticker=result.get("normalized_ticker") or result.get("ticker") or req.ticker,
            news=result.get("news"),
        )
    except Exception:
        logger.debug("Failed to ingest analysis telemetry", exc_info=True)
    try:
        repository = get_analysis_repository()
        await asyncio.to_thread(
            repository.save_analysis,
            result=result,
            request_payload=req.model_dump(),
            job_id=job_id,
            owner_id=owner_id,
        )
    except Exception:
        logger.error(
            "Failed to persist completed analysis result",
            extra={
                "event": "analysis_history_save_failed",
                "request_id": result.get("request_id"),
                "job_id": job_id,
            },
            exc_info=True,
        )


def _timestamp_from_iso(value: str | None) -> float:
    try:
        return datetime.fromisoformat(str(value)).timestamp()
    except (TypeError, ValueError):
        return 0.0


async def _completed_job_summary_from_history(job_id: str, owner_id: str) -> dict[str, Any] | None:
    repository = get_analysis_repository()
    record = await asyncio.to_thread(
        repository.get_analysis_record_by_job_id, job_id, owner_id=owner_id
    )
    if record is None:
        return None
    return {
        "job_id": job_id,
        "request_id": record["request_id"],
        "status": "completed",
        "created_at": _timestamp_from_iso(record.get("created_at")),
        "updated_at": _timestamp_from_iso(record.get("updated_at")),
        "payload": record.get("request_payload") or {},
        "result": record["result"],
        "error": None,
    }


def _run_pipeline_with_progress_worker(*args, **kwargs):
    return pipeline_runner.run_pipeline_with_progress_worker(*args, **kwargs)


def _preflight_market_data_worker(*args, **kwargs):
    return pipeline_runner.preflight_market_data_worker(*args, **kwargs)


async def _get_executor():
    return await pipeline_runner.get_executor()


async def _get_cancel_manager():
    return await pipeline_runner.get_cancel_manager()


async def shutdown_executor() -> None:
    await pipeline_runner.shutdown_executor()


async def _preflight_market_data(req: AnalysisRequest) -> None:
    await pipeline_runner.preflight_market_data(
        req,
        get_executor_func=_get_executor,
        preflight_worker_func=_preflight_market_data_worker,
    )


async def _run_stream_pipeline(
    req: AnalysisRequest,
    request_id: str,
    queue: asyncio.Queue,
    cancel_event: asyncio.Event | None = None,
    runtime: jobs.AnalysisRuntimeState | None = None,
) -> dict[str, Any]:
    runtime = runtime or jobs.get_analysis_runtime()
    return await sse.run_stream_pipeline(
        req,
        request_id,
        queue,
        cancel_event,
        preflight_market_data_func=_preflight_market_data,
        get_cancel_manager_func=_get_cancel_manager,
        get_executor_func=_get_executor,
        pipeline_worker_func=_run_pipeline_with_progress_worker,
        result_cache=runtime.result_cache,
        cache_key_func=_cache_key,
        shape_result_func=_shape_result,
        with_data_fetched_at_func=_with_data_fetched_at,
        write_result_cache=ROUTE_DEPS.enable_result_cache,
        run_preflight=ROUTE_DEPS.run_preflight,
    )


def _job_not_found(job_id: str):
    return jobs.job_not_found(job_id)


async def _forward_job_progress(job, source_queue: asyncio.Queue) -> None:
    await jobs.forward_job_progress(job, source_queue)


async def _wait_for_job_progress(source_queue: asyncio.Queue) -> None:
    await jobs.wait_for_job_progress(source_queue)


async def _start_job(job, runtime: jobs.AnalysisRuntimeState | None = None) -> None:
    runtime = runtime or jobs.get_analysis_runtime()

    async def run_stream_pipeline_with_runtime(req, request_id, queue, cancel_event):
        return await _run_stream_pipeline(req, request_id, queue, cancel_event, runtime=runtime)

    await jobs.start_job(
        job,
        result_cache=runtime.result_cache,
        run_stream_pipeline_func=run_stream_pipeline_with_runtime,
        response_payload_func=_response_payload,
        persist_result_func=_save_analysis_result_async,
        use_cache=ROUTE_DEPS.enable_result_cache,
    )


async def _stream_job_events_with_lease(request: Request, job, rate_limit_lease):
    async for event in jobs.stream_job_events_with_lease(request, job, rate_limit_lease):
        yield event


async def _stream_job_events(request: Request, job):
    async for event in jobs.stream_job_events(request, job):
        yield event


async def _create_analysis_job_response(
    req: AnalysisRequest,
    request_id: str,
    owner_id: str,
    runtime: jobs.AnalysisRuntimeState,
) -> dict[str, str]:
    job = await runtime.job_store.create(
        owner_id=owner_id,
        request_id=request_id,
        cache_key=_cache_key(req),
        payload=req.model_dump(),
    )
    job.task = asyncio.create_task(_start_job(job, runtime=runtime))
    _log_request_accepted("job", request_id, req)
    return {
        "job_id": job.id,
        "request_id": request_id,
        "status": job.status,
        "events_url": f"/api/analysis/jobs/{job.id}/events",
    }


@router.post("/analysis/jobs", response_model=AnalysisJobCreateResponse)
async def create_analysis_job(req: AnalysisRequest, request: Request):
    """Create a cancellable analysis job and return its job_id immediately."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()

    try:
        # Creating a job must not share the 'stream' scope: analysis_job_events
        # holds that scope's lease for the whole SSE connection (potentially
        # the full analysis duration), which would otherwise block a second
        # analysis from ever being created while the first one's progress
        # stream is still open — defeating MAX_CONCURRENT_REQUESTS_PER_KEY.
        async with limit_request(request, request_policy()) as lease:
            runtime = jobs.get_analysis_runtime(request)
            return await _create_analysis_job_response(req, request_id, lease.identifier, runtime)
    except AnalysisJobLimitError as exc:
        raise RateLimitError(
            "Too many analysis jobs are already queued or running.",
            details={"max_active_jobs": exc.max_active_jobs},
        ) from exc


@router.get(
    "/analysis/jobs/{job_id}",
    response_model=AnalysisJobSummaryResponse,
    response_model_exclude_none=True,
)
async def get_analysis_job(job_id: str, request: Request):
    async with limit_request(request, analysis_read_policy()) as lease:
        job_store = jobs.get_analysis_runtime(request).job_store
        job = await job_store.get(job_id, owner_id=lease.identifier)
        if job is None:
            if await job_store.get(job_id) is not None:
                raise _job_not_found(job_id)
            history_summary = await _completed_job_summary_from_history(
                job_id, owner_id=lease.identifier
            )
            if history_summary is None:
                raise _job_not_found(job_id)
            return history_summary
        return job.public_summary()


@router.get("/analysis/jobs/{job_id}/events")
async def analysis_job_events(job_id: str, request: Request):
    rate_limit_lease = limit_request(request, stream_policy())
    await rate_limit_lease.__aenter__()
    try:
        job = await jobs.get_analysis_runtime(request).job_store.get(
            job_id, owner_id=rate_limit_lease.identifier
        )
        if job is None:
            raise _job_not_found(job_id)
    except BaseException:
        await rate_limit_lease.__aexit__(None, None, None)
        raise
    return EventSourceResponse(_stream_job_events_with_lease(request, job, rate_limit_lease))


@router.delete(
    "/analysis/jobs/{job_id}",
    response_model=AnalysisJobSummaryResponse,
    response_model_exclude_none=True,
)
async def cancel_analysis_job(job_id: str, request: Request):
    async with limit_request(request, request_policy()) as lease:
        job = await jobs.get_analysis_runtime(request).job_store.cancel(
            job_id, owner_id=lease.identifier
        )
        if job is None:
            raise _job_not_found(job_id)
        return job.public_summary()


@router.get("/ticker/validate", response_model=TickerValidationResponse)
async def validate_ticker(
    ticker: str, trade_date: str, request: Request, market: str | None = None
):
    from tradingagents.dataflows.providers.y_finance import (
        normalize_ticker as normalize_yfinance_ticker,
    )

    req = normalize_and_validate_analysis_request(
        AnalysisRequest(
            ticker=normalize_yfinance_ticker(ticker),
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


@router.get("/status", response_model=ApiStatusResponse)
async def api_status(request: Request):
    async with limit_request(request, status_policy()):
        return await _api_status_payload(jobs.get_analysis_runtime(request))


async def _api_status_payload(runtime: jobs.AnalysisRuntimeState | None = None):
    try:
        from tradingagents.dataflows.providers.interface import get_tool_cache_stats

        tool_cache = get_tool_cache_stats()
    except Exception as exc:  # pragma: no cover - useful when optional vendor deps are absent
        tool_cache = {"backend": "unavailable", "error": sanitize_message(str(exc))}

    try:
        from tradingagents.llm_cache.exact_cache import get_exact_llm_cache

        from config_llm import build_tradingagents_config

        llm_cache_config = build_tradingagents_config()
        exact_cache = get_exact_llm_cache(llm_cache_config)
        llm_cache = {
            "exact_cache": exact_cache.stats() if exact_cache is not None else {"enabled": False},
            "semantic_cache": {
                "enabled": bool(llm_cache_config.get("llm_semantic_cache_enabled", False)),
                "ttl_seconds": int(llm_cache_config.get("llm_semantic_cache_ttl_seconds") or 3600),
                "max_entries": int(llm_cache_config.get("llm_semantic_cache_max_entries") or 2048),
                "threshold": float(
                    llm_cache_config.get("llm_semantic_cache_similarity_threshold") or 0.97
                ),
                "targets": str(llm_cache_config.get("llm_semantic_cache_targets") or ""),
            },
        }
    except Exception as exc:  # pragma: no cover
        llm_cache = {"backend": "unavailable", "error": sanitize_message(str(exc))}

    try:
        from tradingagents.utils_resilience import get_circuit_states, get_timeout_stats

        circuits = get_circuit_states()
        timeout_workers = get_timeout_stats()
    except Exception as exc:  # pragma: no cover
        circuits = {"error": sanitize_message(str(exc))}
        timeout_workers = {"error": sanitize_message(str(exc))}

    runtime = runtime or jobs.get_analysis_runtime()
    cache_stats = await runtime.result_cache.stats()
    inflight_stats = await runtime.in_flight.stats()
    job_stats = await runtime.job_store.stats()
    return {
        "provider": llm.provider,
        "quick_model": llm.quick_think_llm,
        "deep_model": llm.deep_think_llm,
        "analysis_mode": ANALYSIS_MODE,
        "default_analysis_depth": DEFAULT_ANALYSIS_DEPTH,
        "quant_risk_free_rate": QUANT_RISK_FREE_RATE,
        "limits": {
            "pipeline_timeout_seconds": pipeline_runner.PIPELINE_TIMEOUT_SECONDS,
        },
        "result_cache": cache_stats,
        "in_flight": inflight_stats,
        "jobs": job_stats,
        "tool_cache": tool_cache,
        "llm_cache": llm_cache,
        "circuits": circuits,
        "timeout_workers": timeout_workers,
    }
