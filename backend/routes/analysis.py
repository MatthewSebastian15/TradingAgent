from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import multiprocessing
from typing import Optional

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from config import build_tradingagents_config, settings
from errors import PipelineExecutionError, PipelineTimeoutError, RateLimitError, sanitize_message
from logging_config import request_id_ctx
from rate_limiter import limit_request, request_policy, stream_policy
from routes.validation import AnalysisRequest, normalize_and_validate_analysis_request

logger = logging.getLogger(__name__)
router = APIRouter()

_EXECUTOR = concurrent.futures.ProcessPoolExecutor(
    max_workers=settings.process_pool_workers,
    mp_context=multiprocessing.get_context("spawn"),
)


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

def _run_pipeline(ticker: str, trade_date: str, max_debate_rounds: int, request_id: str = "-") -> dict:
    """Run the full TradingAgents pipeline in a subprocess."""
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

    if pd_obj is not None:
        rating_map = {
            PortfolioRating.BUY: "Buy",
            PortfolioRating.OVERWEIGHT: "Buy",
            PortfolioRating.HOLD: "Hold",
            PortfolioRating.UNDERWEIGHT: "Sell",
            PortfolioRating.SELL: "Sell",
        }
        return {
            "decision": rating_map.get(pd_obj.rating, pd_obj.rating.value),
            "full_decision": full_decision,
            "executive_summary": pd_obj.executive_summary,
            "investment_thesis": pd_obj.investment_thesis,
            "price_target": pd_obj.price_target,
            "time_horizon": pd_obj.time_horizon,
            "confidence_score": pd_obj.confidence_score,
        }

    return {
        "decision": None,
        "full_decision": full_decision,
        "executive_summary": None,
        "investment_thesis": None,
        "price_target": None,
        "time_horizon": None,
        "confidence_score": None,
    }


# ---------------------------------------------------------------------------
# SSE progress tracker
# ---------------------------------------------------------------------------

_AGENT_SEQUENCE = [
    ("market_analyst", "Market Analyst", "Fetching price data and technical indicators..."),
    ("news_analyst", "News Researcher", "Scanning recent headlines and macro events..."),
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


def _sse_error(exc: Exception) -> dict:
    if isinstance(exc, RateLimitError):
        payload = {
            "request_id": request_id_ctx.get(),
            "error": {
                "code": exc.code,
                "message": sanitize_message(exc.user_message),
                "details": exc.details or {},
            },
        }
    elif isinstance(exc, PipelineTimeoutError):
        payload = {
            "request_id": request_id_ctx.get(),
            "error": {"code": exc.code, "message": sanitize_message(exc.user_message)},
        }
    else:
        payload = {
            "request_id": request_id_ctx.get(),
            "error": {
                "code": "PIPELINE_FAILED",
                "message": "Analysis failed. Check backend logs with the request_id.",
            },
        }
    return {"event": "error", "data": json.dumps(payload)}


async def _stream_progress_and_result(
    request: Request,
    ticker: str,
    trade_date: str,
    max_debate_rounds: int,
    request_id: str,
):
    """Yield SSE progress events and the final structured result."""
    try:
        async with limit_request(request, stream_policy()):
            loop = asyncio.get_running_loop()
            future = loop.run_in_executor(
                _EXECUTOR,
                _run_pipeline,
                ticker,
                trade_date,
                max_debate_rounds,
                request_id,
            )

            thresholds = settings.timing.as_thresholds()
            agent_map = {agent[0]: agent for agent in _AGENT_SEQUENCE}
            elapsed = 0
            threshold_idx = 0

            first = agent_map[_AGENT_SEQUENCE[0][0]]
            yield {
                "event": "progress",
                "data": json.dumps({
                    "request_id": request_id,
                    "agent_id": first[0],
                    "agent_name": first[1],
                    "status_message": first[2],
                    "elapsed": 0,
                }),
            }

            while not future.done():
                await asyncio.sleep(1)
                elapsed += 1

                if threshold_idx < len(thresholds) - 1:
                    _, threshold_sec = thresholds[threshold_idx]
                    if elapsed >= threshold_sec:
                        threshold_idx += 1
                        active_id = thresholds[threshold_idx][0]
                        agent = agent_map[active_id]
                        yield {
                            "event": "progress",
                            "data": json.dumps({
                                "request_id": request_id,
                                "agent_id": agent[0],
                                "agent_name": agent[1],
                                "status_message": agent[2],
                                "elapsed": elapsed,
                            }),
                        }

                if elapsed >= settings.pipeline_timeout_seconds:
                    future.cancel()
                    logger.error(
                        "Pipeline timeout",
                        extra={
                            "event": "pipeline_timeout",
                            "request_id": request_id,
                            "ticker": ticker,
                            "trade_date": trade_date,
                            "duration_ms": settings.pipeline_timeout_seconds * 1000,
                        },
                    )
                    yield _sse_error(PipelineTimeoutError(settings.pipeline_timeout_seconds))
                    return

            try:
                result_fields = future.result()
            except Exception as exc:
                logger.error(
                    "Pipeline failed",
                    extra={
                        "event": "pipeline_failed",
                        "request_id": request_id,
                        "ticker": ticker,
                        "trade_date": trade_date,
                    },
                    exc_info=True,
                )
                yield _sse_error(exc)
                return

            yield {
                "event": "result",
                "data": json.dumps(_response_payload(request_id, ticker, trade_date, result_fields)),
            }
    except Exception as exc:
        yield _sse_error(exc)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze/stream")
async def analyze_stream(req: AnalysisRequest, request: Request):
    """SSE endpoint. Uses API-key based stream limits with safe fallback identity."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()
    logger.info(
        "Analysis stream accepted",
        extra={
            "event": "analysis_stream_accepted",
            "request_id": request_id,
            "ticker": req.ticker,
            "trade_date": req.trade_date,
            "max_debate_rounds": req.max_debate_rounds,
        },
    )
    return EventSourceResponse(
        _stream_progress_and_result(
            request,
            req.ticker,
            req.trade_date,
            req.max_debate_rounds,
            request_id,
        )
    )


@router.post("/analyze")
async def analyze(req: AnalysisRequest, request: Request):
    """Standard REST endpoint. Uses API-key based request limits."""
    req = normalize_and_validate_analysis_request(req)
    request_id = request_id_ctx.get()
    logger.info(
        "Analysis request accepted",
        extra={
            "event": "analysis_request_accepted",
            "request_id": request_id,
            "ticker": req.ticker,
            "trade_date": req.trade_date,
            "max_debate_rounds": req.max_debate_rounds,
        },
    )

    async with limit_request(request, request_policy()):
        loop = asyncio.get_running_loop()
        try:
            result_fields = await asyncio.wait_for(
                loop.run_in_executor(
                    _EXECUTOR,
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

    return _response_payload(request_id, req.ticker, req.trade_date, result_fields)
