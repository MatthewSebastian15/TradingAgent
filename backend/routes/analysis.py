from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import multiprocessing
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from tradingagents.default_config import DEFAULT_CONFIG

logger = logging.getLogger(__name__)
router = APIRouter()

PIPELINE_TIMEOUT_SECONDS = 600

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

# Maximum concurrent pipeline runs per client IP.
# Keeps a single user from firing 10 pipelines at once and draining the
# entire Gemini API quota. Adjust the constant to match your quota limits.
_MAX_CONCURRENT_PER_IP = 2

# ip -> asyncio.Semaphore (created on first request from that IP).
_ip_semaphores: dict[str, asyncio.Semaphore] = {}
_ip_semaphores_lock = asyncio.Lock()


async def _get_semaphore(ip: str) -> asyncio.Semaphore:
    async with _ip_semaphores_lock:
        if ip not in _ip_semaphores:
            _ip_semaphores[ip] = asyncio.Semaphore(_MAX_CONCURRENT_PER_IP)
        return _ip_semaphores[ip]


# ---------------------------------------------------------------------------
# Process pool
# ---------------------------------------------------------------------------

# One worker process per CPU core, capped at 4.
# For production with many users, replace with Celery + Redis.
_EXECUTOR = concurrent.futures.ProcessPoolExecutor(
    max_workers=min(4, os.cpu_count() or 2),
    mp_context=multiprocessing.get_context("spawn"),
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AnalysisRequest(BaseModel):
    ticker: str
    trade_date: str
    max_debate_rounds: int = 1


# ---------------------------------------------------------------------------
# Pipeline runner
# ---------------------------------------------------------------------------

def _run_pipeline(ticker: str, trade_date: str, max_debate_rounds: int) -> dict:
    """Run the full TradingAgents pipeline in a subprocess.

    Returns a plain dict (picklable) with all PortfolioDecision fields.
    The route assembles the final JSON from this dict directly, with no
    markdown parsing.
    """
    # All imports must be inside the function: this runs in a spawned subprocess.
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.default_config import DEFAULT_CONFIG as _CFG
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating

    config = _CFG.copy()
    config["max_debate_rounds"] = max_debate_rounds

    ta = TradingAgentsGraph(debug=False, config=config)
    final_state, _ = ta.propagate(ticker, trade_date)

    full_decision: str = final_state.get("final_trade_decision", "")
    pd_obj: Optional[PortfolioDecision] = final_state.get("portfolio_decision")

    if pd_obj is not None:
        # Structured output succeeded. Read fields directly from the typed object.
        rating_map = {
            PortfolioRating.BUY:         "Buy",
            PortfolioRating.OVERWEIGHT:  "Buy",
            PortfolioRating.HOLD:        "Hold",
            PortfolioRating.UNDERWEIGHT: "Sell",
            PortfolioRating.SELL:        "Sell",
        }
        return {
            "decision":          rating_map.get(pd_obj.rating, pd_obj.rating.value),
            "full_decision":     full_decision,
            "executive_summary": pd_obj.executive_summary,
            "investment_thesis": pd_obj.investment_thesis,
            "price_target":      pd_obj.price_target,
            "time_horizon":      pd_obj.time_horizon,
        }

    # Free-text fallback path: structured output was not available.
    # Return None for typed fields so the frontend can handle the degraded case.
    return {
        "decision":          None,
        "full_decision":     full_decision,
        "executive_summary": None,
        "investment_thesis": None,
        "price_target":      None,
        "time_horizon":      None,
    }


# ---------------------------------------------------------------------------
# SSE progress tracker
# ---------------------------------------------------------------------------

_AGENT_SEQUENCE = [
    ("market_analyst",    "Market Analyst",       "Fetching price data and technical indicators..."),
    ("news_analyst",      "News Researcher",      "Scanning recent headlines and macro events..."),
    ("fundamentals",      "Fundamentals Analyst", "Pulling financial statements and ratios..."),
    ("bull_researcher",   "Bull Researcher",      "Building the bullish investment case..."),
    ("bear_researcher",   "Bear Researcher",      "Building the bearish counterarguments..."),
    ("research_manager",  "Research Manager",     "Evaluating the debate and forming an investment plan..."),
    ("trader",            "Trader",               "Translating the plan into a transaction proposal..."),
    ("risk_analysts",     "Risk Analysts",        "Running risk debate: aggressive vs conservative vs neutral..."),
    ("portfolio_manager", "Portfolio Manager",    "Synthesizing all inputs into the final decision..."),
]


async def _stream_progress_and_result(
    ip: str,
    ticker: str,
    trade_date: str,
    max_debate_rounds: int,
):
    """Async generator that yields SSE events during pipeline execution.

    Events:
      - "progress"  one per agent step with estimated timing
      - "result"    final structured JSON when pipeline completes
      - "error"     if pipeline fails, times out, or IP is rate-limited
    """
    semaphore = await _get_semaphore(ip)

    # Non-blocking check: if both slots are taken, reject immediately.
    if semaphore._value == 0:
        yield {
            "event": "error",
            "data": json.dumps({
                "error": (
                    f"Too many concurrent requests. "
                    f"Max {_MAX_CONCURRENT_PER_IP} pipeline(s) allowed per IP at a time. "
                    "Wait for your current analysis to finish."
                )
            }),
        }
        return

    async with semaphore:
        loop = asyncio.get_event_loop()
        future = loop.run_in_executor(
            _EXECUTOR,
            _run_pipeline,
            ticker,
            trade_date,
            max_debate_rounds,
        )

        # Conservative timing estimates for gemini-2.5-flash.
        # Adjust per model if needed.
        thresholds = [
            ("market_analyst",    20),
            ("news_analyst",      45),
            ("fundamentals",      70),
            ("bull_researcher",   90),
            ("bear_researcher",   110),
            ("research_manager",  125),
            ("trader",            135),
            ("risk_analysts",     160),
            ("portfolio_manager", 999),
        ]

        agent_map = {a[0]: a for a in _AGENT_SEQUENCE}
        elapsed = 0
        threshold_idx = 0

        first = agent_map[_AGENT_SEQUENCE[0][0]]
        yield {
            "event": "progress",
            "data": json.dumps({
                "agent_id":       first[0],
                "agent_name":     first[1],
                "status_message": first[2],
                "elapsed":        0,
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
                            "agent_id":       agent[0],
                            "agent_name":     agent[1],
                            "status_message": agent[2],
                            "elapsed":        elapsed,
                        }),
                    }

            if elapsed >= PIPELINE_TIMEOUT_SECONDS:
                future.cancel()
                yield {
                    "event": "error",
                    "data": json.dumps({
                        "error": (
                            f"Pipeline timeout after {PIPELINE_TIMEOUT_SECONDS}s. "
                            "Try again or reduce max_debate_rounds to 1."
                        )
                    }),
                }
                return

        try:
            result_fields = future.result()
        except Exception as exc:
            logger.error(
                "Pipeline failed for %s on %s: %s", ticker, trade_date, exc, exc_info=True
            )
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)}),
            }
            return

        yield {
            "event": "result",
            "data": json.dumps({
                "ticker":      ticker,
                "trade_date":  trade_date,
                "agents_used": [a[1] for a in _AGENT_SEQUENCE],
                **result_fields,
            }),
        }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze/stream")
async def analyze_stream(req: AnalysisRequest, request: Request):
    """SSE endpoint — streams progress events then the final result.

    Rate limited to _MAX_CONCURRENT_PER_IP concurrent pipelines per client IP.
    Sends an 'error' SSE event immediately if the limit is reached.
    """
    client_ip = request.client.host if request.client else "unknown"
    return EventSourceResponse(
        _stream_progress_and_result(
            client_ip,
            req.ticker,
            req.trade_date,
            req.max_debate_rounds,
        )
    )


@router.post("/analyze")
async def analyze(req: AnalysisRequest, request: Request):
    """Standard REST endpoint — blocks until pipeline completes, returns full result.

    Returns HTTP 429 immediately if the per-IP concurrent limit is reached.
    Returns HTTP 504 on pipeline timeout.
    """
    client_ip = request.client.host if request.client else "unknown"
    semaphore = await _get_semaphore(client_ip)

    if semaphore._value == 0:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many concurrent requests. "
                f"Max {_MAX_CONCURRENT_PER_IP} pipeline(s) allowed per IP at a time."
            ),
        )

    async with semaphore:
        loop = asyncio.get_event_loop()
        try:
            result_fields = await asyncio.wait_for(
                loop.run_in_executor(
                    _EXECUTOR,
                    _run_pipeline,
                    req.ticker,
                    req.trade_date,
                    req.max_debate_rounds,
                ),
                timeout=PIPELINE_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.error(
                "Pipeline timeout untuk %s pada %s setelah %ds",
                req.ticker, req.trade_date, PIPELINE_TIMEOUT_SECONDS,
            )
            raise HTTPException(
                status_code=504,
                detail=(
                    f"Pipeline timeout after {PIPELINE_TIMEOUT_SECONDS}s. "
                    "Try again or reduce max_debate_rounds to 1."
                ),
            )
        except Exception as exc:
            logger.error(
                "Pipeline failed untuk %s pada %s: %s",
                req.ticker, req.trade_date, exc, exc_info=True,
            )
            raise HTTPException(status_code=500, detail=str(exc))

    return {
        "ticker":      req.ticker,
        "trade_date":  req.trade_date,
        "agents_used": [a[1] for a in _AGENT_SEQUENCE],
        **result_fields,
    }