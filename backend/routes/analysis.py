from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import multiprocessing
from typing import Optional

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from config import settings
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
    return _parse_final_result(full_decision, pd_obj, PortfolioRating)


def _parse_final_result(full_decision: str, pd_obj: object | None, portfolio_rating: object | None = None) -> dict:
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
    }


async def _get_executor() -> concurrent.futures.ProcessPoolExecutor:
    """Create the process pool lazily after the event loop has started."""
    global _EXECUTOR
    if _EXECUTOR is None:
        async with _EXECUTOR_LOCK:
            if _EXECUTOR is None:
                _EXECUTOR = concurrent.futures.ProcessPoolExecutor(
                    max_workers=settings.process_pool_workers,
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
            timeout=settings.pipeline_timeout_seconds,
        )
    except asyncio.TimeoutError as exc:
        logger.error(
            "Pipeline timeout",
            extra={
                "event": "pipeline_timeout",
                "request_id": request_id,
                "ticker": req.ticker,
                "trade_date": req.trade_date,
                "duration_ms": settings.pipeline_timeout_seconds * 1000,
            },
        )
        raise PipelineTimeoutError(settings.pipeline_timeout_seconds) from exc
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
    """Yield progress events while the shared analysis runner works."""
    task = asyncio.create_task(_execute_analysis(request, req, request_id, stream_policy()))
    thresholds = settings.timing.as_thresholds()
    agent_map = {agent[0]: agent for agent in _AGENT_SEQUENCE}
    elapsed = 0
    threshold_idx = 0

    first = agent_map[_AGENT_SEQUENCE[0][0]]
    yield _sse_event(
        "progress",
        {
            "request_id": request_id,
            "agent_id": first[0],
            "agent_name": first[1],
            "status_message": first[2],
            "elapsed": 0,
        },
    )

    try:
        while not task.done():
            await asyncio.sleep(1)
            elapsed += 1

            if threshold_idx < len(thresholds) - 1:
                _, threshold_sec = thresholds[threshold_idx]
                if elapsed >= threshold_sec:
                    threshold_idx += 1
                    active_id = thresholds[threshold_idx][0]
                    agent = agent_map[active_id]
                    yield _sse_event(
                        "progress",
                        {
                            "request_id": request_id,
                            "agent_id": agent[0],
                            "agent_name": agent[1],
                            "status_message": agent[2],
                            "elapsed": elapsed,
                        },
                    )

            if await request.is_disconnected():
                task.cancel()
                logger.info(
                    "SSE client disconnected",
                    extra={
                        "event": "sse_client_disconnected",
                        "request_id": request_id,
                        "ticker": req.ticker,
                        "trade_date": req.trade_date,
                    },
                )
                return

        payload = await task
        yield _sse_event("result", payload)
    except asyncio.CancelledError:
        task.cancel()
        raise
    except Exception as exc:
        yield _sse_error(exc)


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
