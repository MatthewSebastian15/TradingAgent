from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import multiprocessing
import os
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from tradingagents.default_config import DEFAULT_CONFIG

logger = logging.getLogger(__name__)
router = APIRouter()

PIPELINE_TIMEOUT_SECONDS = 600

# ProcessPoolExecutor dengan satu worker per CPU.
# Setiap request analisis mendapat process sendiri sehingga tidak antri
# di belakang request lain dan tidak saling blokir GIL Python.
# max_workers=None berarti os.cpu_count() — cocok untuk 1-4 request simultan.
# Untuk produksi dengan banyak user, ganti dengan Celery + Redis.
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
# Helpers
# ---------------------------------------------------------------------------

def _parse_decision(full_decision: str) -> dict:
    """Parse rendered markdown from Portfolio Manager into typed fields.

    PM always renders via render_pm_decision which produces:
        **Rating**: Buy
        **Executive Summary**: ...
        **Investment Thesis**: ...
        **Price Target**: 1050.0   (optional)
        **Time Horizon**: 3-6 months  (optional)

    Returns a plain dict so the frontend never has to parse markdown itself.
    """
    def extract(label: str) -> Optional[str]:
        pattern = rf"\*\*{label}\*\*:\s*(.+?)(?=\n\*\*|\Z)"
        match = re.search(pattern, full_decision, re.DOTALL)
        return match.group(1).strip() if match else None

    rating_raw = extract("Rating") or ""
    rating_map = {
        "buy": "Buy",
        "overweight": "Buy",
        "hold": "Hold",
        "underweight": "Sell",
        "sell": "Sell",
    }
    decision = rating_map.get(rating_raw.lower(), rating_raw)

    price_raw = extract("Price Target")
    price_target: Optional[float] = None
    if price_raw:
        try:
            price_target = float(re.sub(r"[^\d.]", "", price_raw))
        except ValueError:
            pass

    return {
        "decision": decision,
        "full_decision": full_decision,
        "executive_summary": extract("Executive Summary"),
        "investment_thesis": extract("Investment Thesis"),
        "price_target": price_target,
        "time_horizon": extract("Time Horizon"),
    }


def _run_pipeline(ticker: str, trade_date: str, max_debate_rounds: int) -> str:
    """Run the full TradingAgents pipeline in a subprocess.

    Runs in a separate process via ProcessPoolExecutor so it does not block
    the FastAPI event loop or compete with other in-flight requests for the GIL.

    Returns the raw full_decision markdown string.
    """
    # Import inside the function: this runs in a spawned subprocess,
    # so all imports must happen fresh inside the worker process.
    from tradingagents.graph.trading_graph import TradingAgentsGraph
    from tradingagents.default_config import DEFAULT_CONFIG as _CFG

    config = _CFG.copy()
    config["max_debate_rounds"] = max_debate_rounds

    ta = TradingAgentsGraph(debug=False, config=config)
    final_state, _ = ta.propagate(ticker, trade_date)
    return final_state.get("final_trade_decision", "")


# ---------------------------------------------------------------------------
# SSE progress tracker
# ---------------------------------------------------------------------------

# Node names in execution order — used to emit progress events.
# These match the node names added in GraphSetup.setup_graph().
_AGENT_SEQUENCE = [
    ("market_analyst",    "Market Analyst",    "Fetching price data and technical indicators..."),
    ("news_analyst",      "News Researcher",   "Scanning recent headlines and macro events..."),
    ("fundamentals",      "Fundamentals Analyst", "Pulling financial statements and ratios..."),
    ("bull_researcher",   "Bull Researcher",   "Building the bullish investment case..."),
    ("bear_researcher",   "Bear Researcher",   "Building the bearish counterarguments..."),
    ("research_manager",  "Research Manager",  "Evaluating the debate and forming an investment plan..."),
    ("trader",            "Trader",            "Translating the plan into a transaction proposal..."),
    ("risk_analysts",     "Risk Analysts",     "Running risk debate: aggressive vs conservative vs neutral..."),
    ("portfolio_manager", "Portfolio Manager", "Synthesizing all inputs into the final decision..."),
]


async def _stream_progress_and_result(
    ticker: str,
    trade_date: str,
    max_debate_rounds: int,
):
    """Async generator that yields SSE events during pipeline execution.

    Events emitted:
      - type: "progress"  — one per agent step, with estimated timing
      - type: "result"    — final structured JSON when pipeline completes
      - type: "error"     — if pipeline fails or times out

    The pipeline runs in a ProcessPoolExecutor subprocess. Progress events
    are emitted on a timer because LangGraph does not yet expose per-node
    callbacks over a subprocess boundary. When you add Celery workers, replace
    the timer with real task-state polling from the Celery result backend.
    """
    loop = asyncio.get_event_loop()

    # Submit pipeline to process pool
    future = loop.run_in_executor(
        _EXECUTOR,
        _run_pipeline,
        ticker,
        trade_date,
        max_debate_rounds,
    )

    # Emit progress events on estimated timing while pipeline runs.
    # Thresholds (seconds since start) when each agent is expected to finish.
    # These are conservative estimates for gemini-2.5-flash.
    # Adjust if you switch models.
    thresholds = [
        ("market_analyst",    20),
        ("news_analyst",      45),
        ("fundamentals",      70),
        ("bull_researcher",   90),
        ("bear_researcher",   110),
        ("research_manager",  125),
        ("trader",            135),
        ("risk_analysts",     160),
        ("portfolio_manager", 999),  # stays active until result arrives
    ]

    agent_map = {a[0]: a for a in _AGENT_SEQUENCE}
    elapsed = 0
    threshold_idx = 0
    active_agent_id = _AGENT_SEQUENCE[0][0]

    # Yield initial event
    first = agent_map[active_agent_id]
    yield {
        "event": "progress",
        "data": json.dumps({
            "agent_id": first[0],
            "agent_name": first[1],
            "status_message": first[2],
            "elapsed": 0,
        }),
    }

    while not future.done():
        await asyncio.sleep(1)
        elapsed += 1

        # Advance to next agent if threshold crossed
        if threshold_idx < len(thresholds) - 1:
            _, threshold_sec = thresholds[threshold_idx]
            if elapsed >= threshold_sec:
                threshold_idx += 1
                active_agent_id = thresholds[threshold_idx][0]
                agent = agent_map[active_agent_id]
                yield {
                    "event": "progress",
                    "data": json.dumps({
                        "agent_id": agent[0],
                        "agent_name": agent[1],
                        "status_message": agent[2],
                        "elapsed": elapsed,
                    }),
                }

        # Hard timeout guard
        if elapsed >= PIPELINE_TIMEOUT_SECONDS:
            future.cancel()
            yield {
                "event": "error",
                "data": json.dumps({
                    "error": f"Pipeline timeout after {PIPELINE_TIMEOUT_SECONDS}s. "
                             "Try again or reduce max_debate_rounds to 1."
                }),
            }
            return

    # Pipeline finished — get result or exception
    try:
        full_decision = future.result()
    except Exception as exc:
        logger.error("Pipeline failed for %s on %s: %s", ticker, trade_date, exc, exc_info=True)
        yield {
            "event": "error",
            "data": json.dumps({"error": str(exc)}),
        }
        return

    parsed = _parse_decision(full_decision)
    result = {
        "ticker": ticker,
        "trade_date": trade_date,
        "agents_used": [a[1] for a in _AGENT_SEQUENCE],
        **parsed,
    }

    yield {
        "event": "result",
        "data": json.dumps(result),
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/analyze/stream")
async def analyze_stream(req: AnalysisRequest):
    """SSE endpoint — streams progress events then the final result.

    The frontend connects with EventSource and receives:
      - Multiple 'progress' events (one per agent) while the pipeline runs
      - One 'result' event with the full structured JSON when done
      - One 'error' event if something goes wrong

    Frontend usage (JavaScript):
        const source = new EventSource('/api/analyze/stream');
        source.addEventListener('progress', e => {
            const { agent_name, status_message, elapsed } = JSON.parse(e.data);
            updateAgentLog(agent_name, status_message, elapsed);
        });
        source.addEventListener('result', e => {
            const result = JSON.parse(e.data);
            showResult(result);
            source.close();
        });
        source.addEventListener('error', e => {
            showError(JSON.parse(e.data).error);
            source.close();
        });

    Note: EventSource only supports GET. To send POST body over SSE,
    the frontend must POST the params first to /analyze/session, get a
    session_id, then open EventSource('/api/analyze/stream?session_id=...').
    The simpler approach used here: accept POST and return StreamingResponse
    with text/event-stream content type directly.
    """
    return EventSourceResponse(
        _stream_progress_and_result(
            req.ticker,
            req.trade_date,
            req.max_debate_rounds,
        )
    )


@router.post("/analyze")
async def analyze(req: AnalysisRequest):
    """Standard REST endpoint — blocks until pipeline completes, returns full result.

    Keep this endpoint alongside /analyze/stream so existing integrations
    and the mock-mode frontend (USE_MOCK=true) continue to work without changes.
    """
    loop = asyncio.get_event_loop()

    try:
        full_decision = await asyncio.wait_for(
            loop.run_in_executor(_EXECUTOR, _run_pipeline, req.ticker, req.trade_date, req.max_debate_rounds),
            timeout=PIPELINE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(
            "Pipeline timeout untuk %s pada %s setelah %ds",
            req.ticker, req.trade_date, PIPELINE_TIMEOUT_