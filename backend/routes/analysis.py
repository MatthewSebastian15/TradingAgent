from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import multiprocessing
from typing import Callable, Optional

from fastapi import APIRouter, Request

try:
    from sse_starlette.sse import EventSourceResponse
except ModuleNotFoundError:  # pragma: no cover - exercised when optional dependency is absent
    from starlette.responses import StreamingResponse

    class EventSourceResponse(StreamingResponse):
        """Small SSE-compatible fallback for local tests/dev.

        Production should still install sse-starlette from requirements.txt.
        This fallback prevents the API from failing at import time when the
        optional package is not installed yet. Because naturally one missing
        package should not burn down the whole app.
        """

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

from config import PIPELINE_TIMEOUT_SECONDS, PROCESS_POOL_WORKERS
from errors import (
    ApiError,
    PipelineExecutionError,
    PipelineTimeoutError,
    RateLimitError,
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


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

def _run_pipeline(ticker: str, trade_date: str, max_debate_rounds: int, request_id: str = "-") -> dict:
    """Run the full TradingAgents pipeline in a subprocess.

    This function must stay module-level and pickle-friendly because
    ProcessPoolExecutor executes it in a separate Python process.
    """
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
    from config import build_tradingagents_config

    worker_logger = logging.getLogger(__name__)
    worker_logger.info(
        "Pipeline worker started",
        extra={
            "event": "pipeline_worker_started",
            "request_id": request_id,
            "ticker": ticker,
            "trade_date": trade_date,
            "max_debate_rounds": max_debate_rounds,
        },
    )

    config = build_tradingagents_config(max_debate_rounds=max_debate_rounds)

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
    return _parse_final_result(full_decision, pd_obj, PortfolioRating, final_state.get("data_quality"))


def _run_pipeline_with_progress(
    ticker: str,
    trade_date: str,
    max_debate_rounds: int,
    request_id: str,
    progress_callback: Optional[Callable[[dict], None]] = None,
) -> dict:
    """Run pipeline in-process so SSE can receive real callback events."""
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
    from config import build_tradingagents_config

    config = build_tradingagents_config(max_debate_rounds=max_debate_rounds)

    if config.get("analysis_mode", "balanced") == "balanced":
        from tradingagents.pipeline_balanced import run_balanced_pipeline

        final_state = run_balanced_pipeline(ticker, trade_date, config, progress_callback=progress_callback)
    else:
        # Classic graph mode does not expose per-agent callbacks yet. Emit one
        # truthful coarse event instead of fake per-agent completion.
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
    return _parse_final_result(full_decision, pd_obj, PortfolioRating, final_state.get("data_quality"))


def _parse_final_result(
    full_decision: str,
    pd_obj: object | None,
    portfolio_rating: object | None = None,
    data_quality: dict | None = None,
) -> dict:
    """Convert the final agent state into the API response fields.

    Kept separate from endpoint code so REST and SSE always return the same
    final result shape.
    """
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
            "data_quality": data_quality or {
                "price_data": "missing",
                "fundamentals": "missing",
                "news": "missing",
                "warnings": ["Pipeline did not return data quality metadata."],
            },
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
        "data_quality": data_quality or {
            "price_data": "missing",
            "fundamentals": "missing",
            "news": "missing",
            "warnings": ["Pipeline did not return data quality metadata."],
        },
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
    ("market_analyst", "Market Analyst", "Fetching price data and technical indicators..."),
    ("news_analyst", "News + Social Analyst", "Scanning recent headlines, macro events, and sentiment signals..."),
    ("fundamentals", "Fundamentals Analyst", "Pulling financial statements and ratios..."),
    ("bull_researcher", "Bull Researcher", "Building the bullish investment case..."),
    ("bear_researcher", "Bear Researcher", "Building the bearish counterarguments..."),
    ("research_manager", "Research Manager", "Evaluating the debate and forming an investment plan..."),
    ("trader", "Trader", "Translating the plan into a transaction proposal..."),
    ("risk_analysts", "Risk Analysts", "Running risk debate: aggressive vs conservative vs neutral..."),
    ("portfolio_manager", "Portfolio Manager", "Synthesizing all inputs into the final decision..."),
]


def _response_payload(request_id: str, ticker: str, trade_date: str, result_fields: dict) -> dict:
    return {
        "request_id": request_id,
        "ticker": ticker,
        "trade_date": trade_date,
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
        },
    )


async def _execute_analysis(
    request: Request,
    req: AnalysisRequest,
    request_id: str,
    policy: RateLimitPolicy,
) -> dict:
    """Single source of truth for validation-ready analysis execution.

    Both /analyze and /analyze/stream call this function. Only the response
    transport differs: JSON for REST, SSE events for streaming.
    """
    async with limit_request(request, policy):
        result_fields = await _run_pipeline_async(req, request_id)
    return _response_payload(request_id, req.ticker, req.trade_date, result_fields)


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse_event(event: str, payload: dict) -> dict:
    return {"event": event, "data": json.dumps(payload)}


def _sse_error(exc: Exception) -> dict:
    if isinstance(exc, ApiError):
        payload = error_payload(exc)
    elif isinstance(exc, RateLimitError):
        payload = error_payload(exc)
    else:
        payload = {
            "request_id": request_id_ctx.get(),
            "error": {
                "code": "PIPELINE_FAILED",
                "message": sanitize_message("Analysis failed. Check backend logs with the request_id."),
            },
        }
    return _sse_event("error", payload)


async def _stream_progress_and_result(
    request: Request,
    req: AnalysisRequest,
    request_id: str,
):
    """Yield real progress events from the pipeline callback, then result."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict] = asyncio.Queue()

    def progress_callback(event: dict) -> None:
        payload = {
            "request_id": request_id,
            "ticker": req.ticker,
            "trade_date": req.trade_date,
            **event,
        }
        loop.call_soon_threadsafe(queue.put_nowait, {"type": "progress", "payload": payload})

    def run() -> dict:
        return _run_pipeline_with_progress(
            req.ticker,
            req.trade_date,
            req.max_debate_rounds,
            request_id,
            progress_callback,
        )

    async def runner() -> None:
        try:
            async with limit_request(request, stream_policy()):
                result_fields = await asyncio.wait_for(
                    asyncio.to_thread(run),
                    timeout=PIPELINE_TIMEOUT_SECONDS,
                )
            payload = _response_payload(request_id, req.ticker, req.trade_date, result_fields)
            await queue.put({"type": "result", "payload": payload})
        except asyncio.TimeoutError as exc:
            await queue.put({"type": "error", "payload": error_payload(PipelineTimeoutError(PIPELINE_TIMEOUT_SECONDS))})
        except Exception as exc:
            if isinstance(exc, ApiError):
                payload = error_payload(exc)
            else:
                payload = {
                    "request_id": request_id,
                    "error": {
                        "code": "PIPELINE_FAILED",
                        "message": sanitize_message("Analysis failed. Check backend logs with the request_id."),
                    },
                }
                logger.error("Streaming pipeline failed", extra={"event": "streaming_pipeline_failed", "request_id": request_id}, exc_info=True)
            await queue.put({"type": "error", "payload": payload})

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
                task.cancel()
                logger.info(
                    "SSE client disconnected",
                    extra={"event": "sse_client_disconnected", "request_id": request_id, "ticker": req.ticker},
                )
                return

            try:
                item = await asyncio.wait_for(queue.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

            yield _sse_event(item["type"], item["payload"])
            if item["type"] in {"result", "error"}:
                return
    finally:
        if not task.done():
            task.cancel()



# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze/stream")
async def analyze_stream(req: AnalysisRequest, request: Request):
    """SSE endpoint. Uses the same analysis runner as the REST endpoint."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()
    _log_request_accepted("stream", request_id, req)
    return EventSourceResponse(_stream_progress_and_result(request, req, request_id))


@router.post("/analyze")
async def analyze(req: AnalysisRequest, request: Request):
    """Standard JSON endpoint. Uses the same analysis runner as SSE."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()
    _log_request_accepted("request", request_id, req)
    return await _execute_analysis(request, req, request_id, request_policy())
