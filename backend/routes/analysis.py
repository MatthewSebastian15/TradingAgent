from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import multiprocessing
from datetime import datetime, timedelta
from typing import Callable, Optional, Any

from fastapi import APIRouter, Request

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

from analysis_cache import AnalysisCacheKey, AnalysisJob, AnalysisJobStore, AnalysisResultCache, InFlightRegistry
from config import (
    ANALYSIS_JOB_MAX_ENTRIES,
    ANALYSIS_JOB_TTL_SECONDS,
    ANALYSIS_RESULT_CACHE_MAX_ENTRIES,
    ANALYSIS_RESULT_CACHE_TTL_SECONDS,
    DEFAULT_ANALYSIS_DEPTH,
    PIPELINE_TIMEOUT_SECONDS,
    PROCESS_POOL_WORKERS,
    build_tradingagents_config,
    llm,
)
from errors import (
    ApiError,
    BadRequestError,
    PipelineExecutionError,
    PipelineTimeoutError,
    error_payload,
    sanitize_message,
)
from logging_config import request_id_ctx
from rate_limiter import RateLimitPolicy, limit_request, request_policy, stream_policy
from routes.validation import AnalysisRequest, normalize_and_validate_analysis_request

logger = logging.getLogger(__name__)
router = APIRouter()

_EXECUTOR: concurrent.futures.ProcessPoolExecutor | None = None
_EXECUTOR_LOCK = asyncio.Lock()

_RESULT_CACHE = AnalysisResultCache(
    ttl_seconds=ANALYSIS_RESULT_CACHE_TTL_SECONDS,
    max_entries=ANALYSIS_RESULT_CACHE_MAX_ENTRIES,
)
_IN_FLIGHT = InFlightRegistry()
_JOB_STORE = AnalysisJobStore(
    ttl_seconds=ANALYSIS_JOB_TTL_SECONDS,
    max_entries=ANALYSIS_JOB_MAX_ENTRIES,
)

SUMMARY_FIELDS = {
    "decision",
    "executive_summary",
    "price_target",
    "time_horizon",
    "confidence_score",
    "suggested_allocation_percent",
    "entry_price",
    "stop_loss",
    "take_profit",
    "risk_reward_ratio",
    "max_drawdown_estimate",
    "volatility_level",
    "rebalancing_action",
    "key_catalysts",
    "invalidation_conditions",
    "data_quality",
    "analysis_depth",
    "llm_call_budget",
    "llm_calls_used",
    "budget_exhausted",
    "agents_skipped",
}

# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------


def _run_pipeline(
    ticker: str,
    trade_date: str,
    max_debate_rounds: int,
    analysis_depth: str,
    response_detail: str,
    request_id: str = "-",
) -> dict:
    """Run the full TradingAgents pipeline in a subprocess."""
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    worker_logger = logging.getLogger(__name__)
    worker_logger.info(
        "Pipeline worker started",
        extra={
            "event": "pipeline_worker_started",
            "request_id": request_id,
            "ticker": ticker,
            "trade_date": trade_date,
            "max_debate_rounds": max_debate_rounds,
            "analysis_depth": analysis_depth,
        },
    )

    config = build_tradingagents_config(
        max_debate_rounds=max_debate_rounds,
        analysis_depth=analysis_depth,
        response_detail=response_detail,
    )

    if config.get("analysis_mode", "balanced") == "balanced":
        from tradingagents.pipeline_balanced import run_balanced_pipeline

        final_state = run_balanced_pipeline(ticker, trade_date, config)
    else:
        ta = TradingAgentsGraph(debug=False, config=config)
        final_state, _ = ta.propagate(ticker, trade_date)

    worker_logger.info(
        "Pipeline worker completed",
        extra={
            "event": "pipeline_worker_completed",
            "request_id": request_id,
            "ticker": ticker,
            "trade_date": trade_date,
        },
    )

    full_decision: str = final_state.get("final_trade_decision", "")
    pd_obj: Optional[PortfolioDecision] = final_state.get("portfolio_decision")
    return _parse_final_result(full_decision, pd_obj, PortfolioRating, final_state)


def _run_pipeline_with_progress(
    ticker: str,
    trade_date: str,
    max_debate_rounds: int,
    analysis_depth: str,
    response_detail: str,
    request_id: str,
    progress_callback: Optional[Callable[[dict], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> dict:
    """Run pipeline in-process so SSE can receive real callback events."""
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    config = build_tradingagents_config(
        max_debate_rounds=max_debate_rounds,
        analysis_depth=analysis_depth,
        response_detail=response_detail,
    )

    if config.get("analysis_mode", "balanced") == "balanced":
        from tradingagents.pipeline_balanced import run_balanced_pipeline

        final_state = run_balanced_pipeline(
            ticker,
            trade_date,
            config,
            progress_callback=progress_callback,
            cancel_check=cancel_check,
        )
    else:
        if progress_callback:
            progress_callback(
                {
                    "agent_id": "classic_graph",
                    "agent_name": "Classic TradingAgents Graph",
                    "status": "started",
                    "status_message": "Classic graph pipeline is running...",
                }
            )
        ta = TradingAgentsGraph(debug=False, config=config)
        final_state, _ = ta.propagate(ticker, trade_date)
        if progress_callback:
            progress_callback(
                {
                    "agent_id": "classic_graph",
                    "agent_name": "Classic TradingAgents Graph",
                    "status": "completed",
                    "status_message": "Classic graph pipeline completed.",
                }
            )

    full_decision: str = final_state.get("final_trade_decision", "")
    pd_obj: Optional[PortfolioDecision] = final_state.get("portfolio_decision")
    return _parse_final_result(full_decision, pd_obj, PortfolioRating, final_state)


def _parse_final_result(
    full_decision: str,
    pd_obj: object | None,
    portfolio_rating: object | None = None,
    final_state: dict | None = None,
) -> dict:
    """Convert the final agent state into API response fields."""
    final_state = final_state or {}
    if pd_obj is not None:
        try:
            from tradingagents.agents.schemas import PortfolioDecision, render_pm_decision

            if isinstance(pd_obj, dict):
                pd_obj = PortfolioDecision.model_validate(pd_obj)
            full_decision = render_pm_decision(pd_obj)  # typed object is the source of truth
        except Exception:
            full_decision = full_decision or ""
    data_quality = final_state.get("data_quality")
    common = {
        "analysis_depth": final_state.get("analysis_depth", DEFAULT_ANALYSIS_DEPTH),
        "llm_call_budget": final_state.get("balanced_gemini_request_budget"),
        "llm_calls_used": final_state.get("balanced_gemini_calls_used"),
        "budget_exhausted": bool(final_state.get("budget_exhausted", False)),
        "agents_skipped": final_state.get("agents_skipped", []) or [],
        "data_quality": data_quality or {
            "price_data": "missing",
            "fundamentals": "missing",
            "news": "missing",
            "warnings": ["Pipeline did not return data quality metadata."],
        },
    }

    if pd_obj is None:
        return {
            "decision": None,
            "full_decision": full_decision,
            "executive_summary": None,
            "investment_thesis": None,
            "price_target": None,
            "time_horizon": None,
            "confidence_score": None,
            "suggested_allocation_percent": None,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward_ratio": None,
            "max_drawdown_estimate": None,
            "volatility_level": None,
            "position_sizing_reason": None,
            "rebalancing_action": None,
            "key_catalysts": [],
            "invalidation_conditions": [],
            **common,
        }

    rating_map = {}
    if portfolio_rating is not None:
        rating_map = {
            portfolio_rating.BUY: "Buy",
            portfolio_rating.OVERWEIGHT: "Buy",
            portfolio_rating.HOLD: "Hold",
            portfolio_rating.UNDERWEIGHT: "Sell",
            portfolio_rating.SELL: "Sell",
        }

    rating = getattr(pd_obj, "rating", None)
    fallback_rating = getattr(rating, "value", rating)

    return {
        "decision": rating_map.get(rating, fallback_rating),
        "full_decision": full_decision,
        "executive_summary": getattr(pd_obj, "executive_summary", None),
        "investment_thesis": getattr(pd_obj, "investment_thesis", None),
        "price_target": getattr(pd_obj, "price_target", None),
        "time_horizon": getattr(pd_obj, "time_horizon", None),
        "confidence_score": getattr(pd_obj, "confidence_score", None),
        "suggested_allocation_percent": getattr(pd_obj, "suggested_allocation_percent", None),
        "entry_price": getattr(pd_obj, "entry_price", None),
        "stop_loss": getattr(pd_obj, "stop_loss", None),
        "take_profit": getattr(pd_obj, "take_profit", None),
        "risk_reward_ratio": getattr(pd_obj, "risk_reward_ratio", None),
        "max_drawdown_estimate": getattr(pd_obj, "max_drawdown_estimate", None),
        "volatility_level": getattr(getattr(pd_obj, "volatility_level", None), "value", getattr(pd_obj, "volatility_level", None)),
        "position_sizing_reason": getattr(pd_obj, "position_sizing_reason", None),
        "rebalancing_action": getattr(pd_obj, "rebalancing_action", None),
        "key_catalysts": getattr(pd_obj, "key_catalysts", []) or [],
        "invalidation_conditions": getattr(pd_obj, "invalidation_conditions", []) or [],
        **common,
    }


async def _get_executor() -> concurrent.futures.ProcessPoolExecutor:
    """Create the process pool lazily after the event loop has started."""
    global _EXECUTOR
    if _EXECUTOR is None:
        async with _EXECUTOR_LOCK:
            if _EXECUTOR is None:
                _EXECUTOR = concurrent.futures.ProcessPoolExecutor(
                    max_workers=PROCESS_POOL_WORKERS,
                    mp_context=multiprocessing.get_context("spawn"),
                )
    return _EXECUTOR


async def shutdown_executor() -> None:
    """Stop worker processes during FastAPI shutdown."""
    global _EXECUTOR
    if _EXECUTOR is not None:
        _EXECUTOR.shutdown(wait=False, cancel_futures=True)
        _EXECUTOR = None


async def _run_pipeline_async(req: AnalysisRequest, request_id: str) -> dict:
    """Run the blocking pipeline with one shared timeout path."""
    loop = asyncio.get_running_loop()
    executor = await _get_executor()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(
                executor,
                _run_pipeline,
                req.ticker,
                req.trade_date,
                req.max_debate_rounds,
                req.analysis_depth,
                req.response_detail,
                request_id,
            ),
            timeout=PIPELINE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        logger.error(
            "Pipeline timeout",
            extra={
                "event": "pipeline_timeout",
                "request_id": request_id,
                "ticker": req.ticker,
                "trade_date": req.trade_date,
                "duration_ms": PIPELINE_TIMEOUT_SECONDS * 1000,
            },
        )
        raise PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS) from exc
    except ApiError:
        raise
    except Exception as exc:
        logger.error(
            "Pipeline failed",
            extra={
                "event": "pipeline_failed",
                "request_id": request_id,
                "ticker": req.ticker,
                "trade_date": req.trade_date,
            },
            exc_info=True,
        )
        raise PipelineExecutionError(internal_message=str(exc)) from exc


# ---------------------------------------------------------------------------
# Shared endpoint logic
# ---------------------------------------------------------------------------

_AGENT_SEQUENCE = [
    ("data_collection", "Data Collection", "Fetching market data..."),
    ("market_analyst", "Market Analyst", "Reading price data and technical indicators..."),
    ("news_analyst", "News + Social Analyst", "Scanning headlines, macro events, and sentiment signals..."),
    ("fundamentals", "Fundamentals Analyst", "Reviewing financial statements and ratios..."),
    ("bull_researcher", "Bull Researcher", "Building or skipping the bullish investment case..."),
    ("bear_researcher", "Bear Researcher", "Building or skipping the bearish counterarguments..."),
    ("research_manager", "Research Manager", "Evaluating the debate and forming an investment plan..."),
    ("trader", "Trader", "Translating the plan into a transaction proposal..."),
    ("risk_analysts", "Risk Analysts", "Running or skipping risk debate..."),
    ("portfolio_manager", "Portfolio Manager", "Synthesizing all inputs into the final decision..."),
]


def _cache_key(req: AnalysisRequest) -> AnalysisCacheKey:
    return AnalysisCacheKey(
        ticker=req.ticker,
        trade_date=req.trade_date,
        provider=llm.provider,
        quick_model=llm.quick_think_llm,
        deep_model=llm.deep_think_llm,
        analysis_mode="balanced",
        analysis_depth=req.analysis_depth,
        max_debate_rounds=req.max_debate_rounds,
        response_detail=req.response_detail,
    )


def _shape_result(result_fields: dict[str, Any], response_detail: str) -> dict[str, Any]:
    """Trim response payload for summary mode; keep debug metadata only in debug."""
    if response_detail == "summary":
        return {key: value for key, value in result_fields.items() if key in SUMMARY_FIELDS or key == "cache"}
    if response_detail == "debug":
        return result_fields
    return {key: value for key, value in result_fields.items() if key not in {"raw_agent_state"}}


def _response_payload(request_id: str, req: AnalysisRequest, result_fields: dict) -> dict:
    return {
        "request_id": request_id,
        "ticker": req.ticker,
        "trade_date": req.trade_date,
        "analysis_depth": req.analysis_depth,
        "response_detail": req.response_detail,
        "agents_used": [agent[1] for agent in _AGENT_SEQUENCE],
        **result_fields,
    }


def _log_request_accepted(mode: str, request_id: str, req: AnalysisRequest) -> None:
    logger.info(
        "Analysis %s accepted",
        mode,
        extra={
            "event": f"analysis_{mode}_accepted",
            "request_id": request_id,
            "ticker": req.ticker,
            "trade_date": req.trade_date,
            "max_debate_rounds": req.max_debate_rounds,
            "analysis_depth": req.analysis_depth,
            "response_detail": req.response_detail,
        },
    )


async def _preflight_market_data(req: AnalysisRequest) -> None:
    """Fail fast for obviously invalid tickers before any Gemini call."""
    from tradingagents.dataflows.config import set_config
    from tradingagents.dataflows.data_quality import looks_missing
    from tradingagents.dataflows.interface import route_to_vendor

    config = build_tradingagents_config(
        max_debate_rounds=req.max_debate_rounds,
        analysis_depth=req.analysis_depth,
        response_detail=req.response_detail,
    )

    trade_dt = datetime.strptime(req.trade_date, "%Y-%m-%d")
    start = (trade_dt - timedelta(days=10)).strftime("%Y-%m-%d")
    end = (trade_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    def check() -> str:
        set_config(config)
        return str(route_to_vendor("get_stock_data", req.ticker, start, end))

    try:
        sample = await asyncio.to_thread(check)
    except Exception as exc:
        raise BadRequestError(
            "Ticker preflight failed before the LLM pipeline started.",
            details={"ticker": req.ticker, "reason": sanitize_message(str(exc))},
        ) from exc

    if looks_missing(sample):
        raise BadRequestError(
            "No usable price data was found for this ticker/date. Gemini was not called.",
            details={"ticker": req.ticker, "trade_date": req.trade_date},
        )


def _is_default_callable(func: Callable[..., Any], name: str) -> bool:
    return getattr(func, "__module__", "") == __name__ and getattr(func, "__name__", "") == name


async def _compute_result_fields(req: AnalysisRequest, request_id: str) -> dict[str, Any]:
    if _is_default_callable(_run_pipeline_async, "_run_pipeline_async"):
        await _preflight_market_data(req)
    result_fields = await _run_pipeline_async(req, request_id)
    return _shape_result(result_fields, req.response_detail)


async def _execute_analysis(
    request: Request,
    req: AnalysisRequest,
    request_id: str,
    policy: RateLimitPolicy,
) -> dict:
    """Run cached/deduplicated JSON analysis."""
    key = _cache_key(req)
    use_cache = _is_default_callable(_run_pipeline_async, "_run_pipeline_async")
    async with limit_request(request, policy):
        if not use_cache:
            fields = await _compute_result_fields(req, request_id)
            return _response_payload(request_id, req, fields)

        cached = await _RESULT_CACHE.get(key)
        if cached is not None:
            return _response_payload(request_id, req, cached)

        async def factory() -> dict[str, Any]:
            fields = await _compute_result_fields(req, request_id)
            await _RESULT_CACHE.set(key, fields)
            return fields

        fields, _joined = await _IN_FLIGHT.run(key, factory)
        return _response_payload(request_id, req, fields)


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def _sse_event(event: str, payload: dict) -> dict:
    return {"event": event, "data": json.dumps(payload)}


def _sse_error(exc: Exception) -> dict:
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
    return _sse_event("error", payload)


async def _run_stream_pipeline(
    req: AnalysisRequest,
    request_id: str,
    queue: asyncio.Queue,
    cancel_event: asyncio.Event | None = None,
) -> dict[str, Any]:
    """Run a progress-capable pipeline and cache its final result."""
    loop = asyncio.get_running_loop()

    def progress_callback(event: dict) -> None:
        payload = {
            "request_id": request_id,
            "ticker": req.ticker,
            "trade_date": req.trade_date,
            **event,
        }
        loop.call_soon_threadsafe(queue.put_nowait, {"type": "progress", "payload": payload})

    def is_cancelled() -> bool:
        return bool(cancel_event and cancel_event.is_set())

    def run() -> dict:
        try:
            return _run_pipeline_with_progress(
                req.ticker,
                req.trade_date,
                req.max_debate_rounds,
                req.analysis_depth,
                req.response_detail,
                request_id,
                progress_callback,
                is_cancelled,
            )
        except TypeError as exc:
            # Backward-compatible path for older tests/local monkeypatches that
            # still use the pre-depth signature. Real runtime uses the new path.
            if _is_default_callable(_run_pipeline_with_progress, "_run_pipeline_with_progress"):
                raise
            logger.debug("Using legacy _run_pipeline_with_progress signature: %s", exc)
            return _run_pipeline_with_progress(
                req.ticker,
                req.trade_date,
                req.max_debate_rounds,
                request_id,
                progress_callback,
            )

    if _is_default_callable(_run_pipeline_with_progress, "_run_pipeline_with_progress"):
        await _preflight_market_data(req)
    fields = await asyncio.wait_for(asyncio.to_thread(run), timeout=PIPELINE_TIMEOUT_SECONDS)
    shaped = _shape_result(fields, req.response_detail)
    if _is_default_callable(_run_pipeline_with_progress, "_run_pipeline_with_progress"):
        await _RESULT_CACHE.set(_cache_key(req), shaped)
    return shaped


async def _stream_progress_and_result(
    request: Request,
    req: AnalysisRequest,
    request_id: str,
):
    """Yield cached result, real progress events, heartbeats, then result."""
    key = _cache_key(req)
    cached = await _RESULT_CACHE.get(key) if _is_default_callable(_run_pipeline_with_progress, "_run_pipeline_with_progress") else None
    if cached is not None:
        yield _sse_event(
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
        yield _sse_event("result", _response_payload(request_id, req, cached))
        return

    queue: asyncio.Queue[dict] = asyncio.Queue()
    cancel_event = asyncio.Event()

    async def runner() -> None:
        try:
            async with limit_request(request, stream_policy()):
                result_fields = await _run_stream_pipeline(req, request_id, queue, cancel_event)
            await queue.put({"type": "result", "payload": _response_payload(request_id, req, result_fields)})
        except asyncio.TimeoutError:
            await queue.put(_sse_error(PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS)))
        except asyncio.CancelledError as exc:
            cancel_event.set()
            await queue.put(_sse_error(exc))
        except Exception as exc:
            if not isinstance(exc, ApiError):
                logger.error(
                    "Streaming pipeline failed",
                    extra={"event": "streaming_pipeline_failed", "request_id": request_id},
                    exc_info=True,
                )
            await queue.put(_sse_error(exc))

    task = asyncio.create_task(runner())
    try:
        yield _sse_event(
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
                yield _sse_event(
                    "heartbeat",
                    {
                        "request_id": request_id,
                        "ticker": req.ticker,
                        "trade_date": req.trade_date,
                        "status": "running",
                    },
                )
                continue

            yield _sse_event(item["type"], item["payload"])
            if item["type"] in {"result", "error"}:
                return
    finally:
        if not task.done():
            cancel_event.set()
            task.cancel()


# ---------------------------------------------------------------------------
# Job helpers
# ---------------------------------------------------------------------------


async def _start_job(job: AnalysisJob, request: Request) -> None:
    req = AnalysisRequest(**job.payload)
    cached = await _RESULT_CACHE.get(job.cache_key)
    if cached is not None:
        job.status = "completed"
        job.result = _response_payload(job.request_id, req, cached)
        job.updated_at = datetime.utcnow().timestamp()
        await job.queue.put({"type": "result", "payload": job.result})
        job.done_event.set()
        return

    job.status = "running"
    job.updated_at = datetime.utcnow().timestamp()

    try:
        async with limit_request(request, stream_policy()):
            fields = await _run_stream_pipeline(req, job.request_id, job.queue, job.cancel_event)
        if job.cancel_event.is_set():
            raise asyncio.CancelledError()
        job.result = _response_payload(job.request_id, req, fields)
        job.status = "completed"
        await job.queue.put({"type": "result", "payload": job.result})
    except asyncio.CancelledError:
        job.status = "cancelled"
        job.error = {"request_id": job.request_id, "error": {"code": "ANALYSIS_CANCELLED", "message": "Analysis was cancelled by the client."}}
        await job.queue.put({"type": "error", "payload": job.error})
    except asyncio.TimeoutError:
        exc = PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS)
        job.status = "failed"
        job.error = error_payload(exc)
        await job.queue.put({"type": "error", "payload": job.error})
    except Exception as exc:
        job.status = "failed"
        if isinstance(exc, ApiError):
            job.error = error_payload(exc)
        else:
            logger.error("Analysis job failed", extra={"event": "analysis_job_failed", "job_id": job.id}, exc_info=True)
            job.error = error_payload(PipelineExecutionError(internal_message=str(exc)))
        await job.queue.put({"type": "error", "payload": job.error})
    finally:
        job.updated_at = datetime.utcnow().timestamp()
        job.done_event.set()


async def _stream_job_events(request: Request, job: AnalysisJob):
    yield _sse_event("job", job.public_summary())

    while True:
        if await request.is_disconnected():
            return

        try:
            item = await asyncio.wait_for(job.queue.get(), timeout=15)
        except asyncio.TimeoutError:
            yield _sse_event("heartbeat", {"job_id": job.id, "request_id": job.request_id, "status": job.status})
            if job.done_event.is_set() and job.queue.empty():
                return
            continue

        yield _sse_event(item["type"], item["payload"])
        if item["type"] in {"result", "error"}:
            return


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/analyze/stream")
async def analyze_stream(req: AnalysisRequest, request: Request):
    """SSE endpoint with cache hit shortcut, heartbeat, and cancellation on disconnect."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()
    _log_request_accepted("stream", request_id, req)
    return EventSourceResponse(_stream_progress_and_result(request, req, request_id))


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
    _log_request_accepted("job", request_id, req)
    job = await _JOB_STORE.create(request_id=request_id, cache_key=_cache_key(req), payload=req.model_dump())
    job.task = asyncio.create_task(_start_job(job, request))
    return {"job_id": job.id, "request_id": request_id, "status": job.status, "events_url": f"/api/analysis/jobs/{job.id}/events"}


@router.get("/analysis/jobs/{job_id}")
async def get_analysis_job(job_id: str):
    job = await _JOB_STORE.get(job_id)
    if job is None:
        raise BadRequestError("Analysis job was not found.", details={"job_id": job_id})
    return job.public_summary()


@router.get("/analysis/jobs/{job_id}/events")
async def analysis_job_events(job_id: str, request: Request):
    job = await _JOB_STORE.get(job_id)
    if job is None:
        raise BadRequestError("Analysis job was not found.", details={"job_id": job_id})
    return EventSourceResponse(_stream_job_events(request, job))


@router.delete("/analysis/jobs/{job_id}")
async def cancel_analysis_job(job_id: str):
    job = await _JOB_STORE.cancel(job_id)
    if job is None:
        raise BadRequestError("Analysis job was not found.", details={"job_id": job_id})
    return job.public_summary()


@router.delete("/analysis/{job_id}")
async def cancel_analysis_job_alias(job_id: str):
    """Compatibility alias for cancellation endpoint."""
    return await cancel_analysis_job(job_id)


@router.get("/ticker/validate")
async def validate_ticker(ticker: str, trade_date: str):
    req = normalize_and_validate_analysis_request(
        AnalysisRequest(ticker=ticker, trade_date=trade_date, max_debate_rounds=1, analysis_depth="fast", response_detail="summary")
    )
    await _preflight_market_data(req)
    return {"ticker": req.ticker, "trade_date": req.trade_date, "valid": True, "message": "Ticker has usable market data."}


@router.get("/status")
async def api_status():
    try:
        from tradingagents.dataflows.interface import get_tool_cache_stats
        tool_cache = get_tool_cache_stats()
    except Exception as exc:  # pragma: no cover - useful when optional vendor deps are absent
        tool_cache = {"backend": "unavailable", "error": sanitize_message(str(exc))}

    try:
        from tradingagents.utils_resilience import get_circuit_states
        circuits = get_circuit_states()
    except Exception as exc:  # pragma: no cover
        circuits = {"error": sanitize_message(str(exc))}

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
            "pipeline_timeout_seconds": PIPELINE_TIMEOUT_SECONDS,
        },
        "result_cache": cache_stats,
        "in_flight": inflight_stats,
        "jobs": job_stats,
        "tool_cache": tool_cache,
        "circuits": circuits,
    }
