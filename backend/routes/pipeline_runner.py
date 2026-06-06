from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import multiprocessing
from collections.abc import Callable
from datetime import datetime
from multiprocessing.managers import SyncManager
from typing import Any

from dateutil.relativedelta import relativedelta
from fastapi import Request

from config import (
    PIPELINE_TIMEOUT_SECONDS,
    PREFLIGHT_TIMEOUT_SECONDS,
    PROCESS_POOL_MAX_TASKS_PER_CHILD,
    PROCESS_POOL_WORKERS,
    build_tradingagents_config,
)
from errors import ApiError, BadRequestError, PipelineExecutionError, PipelineTimeoutError, sanitize_message
from routes.serializers import parse_final_result
from routes.validation import AnalysisRequest

logger = logging.getLogger(__name__)


class PipelineProcessRuntime:
    """Owns process-pool resources behind a resettable runtime object."""

    def __init__(self) -> None:
        self.executor: concurrent.futures.ProcessPoolExecutor | None = None
        self.executor_lock = asyncio.Lock()
        self.cancel_manager: SyncManager | None = None
        self.cancel_manager_lock = asyncio.Lock()

    async def get_executor(self) -> concurrent.futures.ProcessPoolExecutor:
        """Create the process pool lazily after the event loop has started."""
        if self.executor is None:
            async with self.executor_lock:
                if self.executor is None:
                    executor_kwargs = {
                        "max_workers": PROCESS_POOL_WORKERS,
                        "mp_context": multiprocessing.get_context("spawn"),
                        "max_tasks_per_child": PROCESS_POOL_MAX_TASKS_PER_CHILD,
                    }
                    self.executor = concurrent.futures.ProcessPoolExecutor(**executor_kwargs)
        return self.executor

    async def get_cancel_manager(self) -> SyncManager:
        """Create a process-safe cancellation manager lazily."""
        if self.cancel_manager is None:
            async with self.cancel_manager_lock:
                if self.cancel_manager is None:
                    self.cancel_manager = multiprocessing.Manager()
        return self.cancel_manager

    async def new_cancel_event(self) -> Any:
        manager = await self.get_cancel_manager()
        return manager.Event()

    async def shutdown(self) -> None:
        """Stop worker processes during FastAPI shutdown."""
        if self.executor is not None:
            self.executor.shutdown(wait=False, cancel_futures=True)
            self.executor = None
        if self.cancel_manager is not None:
            self.cancel_manager.shutdown()
            self.cancel_manager = None


_PIPELINE_RUNTIME = PipelineProcessRuntime()


def get_pipeline_runtime() -> PipelineProcessRuntime:
    return _PIPELINE_RUNTIME


async def reset_pipeline_runtime_for_tests() -> PipelineProcessRuntime:
    """Shutdown and replace process runtime state for deterministic tests."""
    global _PIPELINE_RUNTIME
    await _PIPELINE_RUNTIME.shutdown()
    _PIPELINE_RUNTIME = PipelineProcessRuntime()
    return _PIPELINE_RUNTIME


def _coerce_pipeline_position_args(
    has_existing_position: Any,
    position_quantity: Any,
    average_entry_price: Any,
    cancel_event: Any,
) -> tuple[bool, float | None, float | None, Any | None]:
    """Support both legacy and current positional argument order.

    Older internal callers passed cancel_event immediately after request_id.
    Newer integration flow keeps cancel_event last so tests and cancellation
    wrappers can always find it at args[-1]. This adapter keeps both
    positional styles safe during the transition.
    """
    legacy_cancel_first = has_existing_position is not None and not isinstance(has_existing_position, bool)
    legacy_position_payload = isinstance(position_quantity, bool)
    if legacy_cancel_first or (has_existing_position is None and legacy_position_payload):
        legacy_cancel_event = has_existing_position
        return (
            bool(position_quantity) if legacy_position_payload else False,
            average_entry_price if legacy_position_payload else None,
            cancel_event if legacy_position_payload else None,
            legacy_cancel_event,
        )
    return bool(has_existing_position), position_quantity, average_entry_price, cancel_event


def run_pipeline(
    ticker: str,
    trade_date: str,
    time_horizon_months: int,
    max_debate_rounds: int,
    analysis_depth: str,
    response_detail: str,
    request_id: str = "-",
    has_existing_position: bool = False,
    position_quantity: float | None = None,
    average_entry_price: float | None = None,
    cancel_event: Any | None = None,
) -> dict:
    """Run the full TradingAgents pipeline in a subprocess."""
    has_existing_position, position_quantity, average_entry_price, cancel_event = _coerce_pipeline_position_args(
        has_existing_position,
        position_quantity,
        average_entry_price,
        cancel_event,
    )

    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
    from tradingagents.pipeline_balanced import run_balanced_pipeline

    worker_logger = logging.getLogger(__name__)
    worker_logger.info(
        "Pipeline worker started",
        extra={
            "event": "pipeline_worker_started",
            "request_id": request_id,
            "ticker": ticker,
            "trade_date": trade_date,
            "time_horizon_months": time_horizon_months,
            "max_debate_rounds": max_debate_rounds,
            "analysis_depth": analysis_depth,
        },
    )

    def is_cancelled() -> bool:
        return is_cancel_event_set(cancel_event)

    config = build_tradingagents_config(
        max_debate_rounds=max_debate_rounds,
        analysis_depth=analysis_depth,
        response_detail=response_detail,
    )
    config["time_horizon_months"] = time_horizon_months

    if is_cancelled():
        raise RuntimeError("Analysis was cancelled by the client.")

    final_state = run_balanced_pipeline(
        ticker,
        trade_date,
        config,
        cancel_check=is_cancelled,
        has_existing_position=has_existing_position,
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
    )

    if is_cancelled():
        raise RuntimeError("Analysis was cancelled by the client.")

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
    pd_obj: PortfolioDecision | None = final_state.get("portfolio_decision")
    return parse_final_result(full_decision, pd_obj, PortfolioRating, final_state)


def run_pipeline_with_progress(
    ticker: str,
    trade_date: str,
    time_horizon_months: int,
    max_debate_rounds: int,
    analysis_depth: str,
    response_detail: str,
    request_id: str,
    progress_callback: Callable[[dict], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    has_existing_position: bool = False,
    position_quantity: float | None = None,
    average_entry_price: float | None = None,
) -> dict:
    """Run pipeline in-process so SSE can receive real callback events."""
    from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating
    from tradingagents.pipeline_balanced import run_balanced_pipeline

    config = build_tradingagents_config(
        max_debate_rounds=max_debate_rounds,
        analysis_depth=analysis_depth,
        response_detail=response_detail,
    )
    config["time_horizon_months"] = time_horizon_months

    final_state = run_balanced_pipeline(
        ticker,
        trade_date,
        config,
        progress_callback=progress_callback,
        cancel_check=cancel_check,
        has_existing_position=has_existing_position,
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
    )

    full_decision: str = final_state.get("final_trade_decision", "")
    pd_obj: PortfolioDecision | None = final_state.get("portfolio_decision")
    return parse_final_result(full_decision, pd_obj, PortfolioRating, final_state)


def run_pipeline_with_progress_worker(
    ticker: str,
    trade_date: str,
    time_horizon_months: int,
    max_debate_rounds: int,
    analysis_depth: str,
    response_detail: str,
    request_id: str,
    progress_queue: Any,
    cancel_event: Any | None = None,
    has_existing_position: bool = False,
    position_quantity: float | None = None,
    average_entry_price: float | None = None,
) -> dict:
    """Run the progress pipeline inside a process-pool worker."""

    def progress_callback(event: dict) -> None:
        payload = {
            "request_id": request_id,
            "ticker": ticker,
            "trade_date": trade_date,
            **event,
        }
        progress_queue.put({"type": "progress", "payload": payload})

    def is_cancelled() -> bool:
        return is_cancel_event_set(cancel_event)

    return run_pipeline_with_progress(
        ticker,
        trade_date,
        time_horizon_months,
        max_debate_rounds,
        analysis_depth,
        response_detail,
        request_id,
        progress_callback,
        is_cancelled,
        has_existing_position,
        position_quantity,
        average_entry_price,
    )


def preflight_market_data_worker(
    ticker: str,
    trade_date: str,
    max_debate_rounds: int,
    analysis_depth: str,
    response_detail: str,
) -> str:
    """Fetch a small price sample inside an isolated worker process."""
    from tradingagents.dataflows.config import use_config
    from tradingagents.dataflows.interface import route_to_vendor

    config = build_tradingagents_config(
        max_debate_rounds=max_debate_rounds,
        analysis_depth=analysis_depth,
        response_detail=response_detail,
    )
    trade_dt = datetime.strptime(trade_date, "%Y-%m-%d")
    start = (trade_dt - relativedelta(years=1)).strftime("%Y-%m-%d")
    end = (trade_dt + relativedelta(days=1)).strftime("%Y-%m-%d")

    with use_config(config):
        return str(route_to_vendor("get_stock_data", ticker, start, end))


async def get_executor() -> concurrent.futures.ProcessPoolExecutor:
    return await get_pipeline_runtime().get_executor()


async def get_cancel_manager() -> SyncManager:
    return await get_pipeline_runtime().get_cancel_manager()


async def new_cancel_event() -> Any:
    return await get_pipeline_runtime().new_cancel_event()


def is_cancel_event_set(cancel_event: Any | None) -> bool:
    if cancel_event is None:
        return False
    try:
        return bool(cancel_event.is_set())
    except Exception:
        return False


def set_cancel_event(cancel_event: Any | None) -> None:
    if cancel_event is None:
        return
    try:
        cancel_event.set()
    except Exception:
        logger.debug("Unable to set pipeline cancellation event", exc_info=True)


async def watch_request_disconnect(
    request: Request | None,
    req: AnalysisRequest,
    request_id: str,
    cancel_event: Any | None,
    future: asyncio.Future,
    *,
    set_cancel_event_func: Callable[[Any | None], None] = set_cancel_event,
) -> None:
    """Cancel the subprocess pipeline when a regular HTTP client disconnects."""
    if request is None:
        return

    while not future.done():
        try:
            disconnected = await request.is_disconnected()
        except Exception:
            logger.debug(
                "Unable to check request disconnect state",
                extra={"event": "request_disconnect_check_failed", "request_id": request_id},
                exc_info=True,
            )
            return
        if disconnected:
            set_cancel_event_func(cancel_event)
            future.cancel()
            logger.info(
                "HTTP client disconnected; cancelling pipeline worker",
                extra={
                    "event": "http_client_disconnected",
                    "request_id": request_id,
                    "ticker": req.ticker,
                    "trade_date": req.trade_date,
                },
            )
            return
        await asyncio.sleep(0.5)


async def shutdown_executor() -> None:
    await get_pipeline_runtime().shutdown()


async def run_pipeline_async(
    req: AnalysisRequest,
    request_id: str,
    request: Request | None = None,
    *,
    get_executor_func: Callable[[], Any] = get_executor,
    new_cancel_event_func: Callable[[], Any] = new_cancel_event,
    run_pipeline_func: Callable[..., dict] = run_pipeline,
    set_cancel_event_func: Callable[[Any | None], None] = set_cancel_event,
    watch_request_disconnect_func: Callable[..., Any] = watch_request_disconnect,
) -> dict:
    """Run the blocking pipeline with one shared timeout path."""
    loop = asyncio.get_running_loop()
    executor = await get_executor_func()
    cancel_event = await new_cancel_event_func()
    future = loop.run_in_executor(
        executor,
        run_pipeline_func,
        req.ticker,
        req.trade_date,
        req.time_horizon_months,
        req.max_debate_rounds,
        req.analysis_depth,
        req.response_detail,
        request_id,
        req.has_existing_position if req.has_existing_position is not None else False,
        req.position_quantity,
        req.average_entry_price,
        cancel_event,
    )
    disconnect_task = (
        asyncio.create_task(
            watch_request_disconnect_func(
                request,
                req,
                request_id,
                cancel_event,
                future,
                set_cancel_event_func=set_cancel_event_func,
            )
        )
        if request is not None
        else None
    )
    try:
        return await asyncio.wait_for(future, timeout=PIPELINE_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        set_cancel_event_func(cancel_event)
        future.cancel()
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
    except asyncio.CancelledError:
        set_cancel_event_func(cancel_event)
        future.cancel()
        logger.info(
            "Pipeline request cancelled",
            extra={
                "event": "pipeline_cancelled",
                "request_id": request_id,
                "ticker": req.ticker,
                "trade_date": req.trade_date,
            },
        )
        raise
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
    finally:
        if disconnect_task is not None and not disconnect_task.done():
            disconnect_task.cancel()


async def preflight_market_data(
    req: AnalysisRequest,
    *,
    get_executor_func: Callable[[], Any] = get_executor,
    preflight_worker_func: Callable[..., str] = preflight_market_data_worker,
) -> None:
    """Fail fast for obviously invalid tickers before any Gemini call."""
    from tradingagents.dataflows.data_quality import looks_missing

    loop = asyncio.get_running_loop()
    executor = await get_executor_func()
    future = loop.run_in_executor(
        executor,
        preflight_worker_func,
        req.ticker,
        req.trade_date,
        req.max_debate_rounds,
        req.analysis_depth,
        req.response_detail,
    )
    try:
        sample = await asyncio.wait_for(future, timeout=PREFLIGHT_TIMEOUT_SECONDS)
    except TimeoutError as exc:
        if future.done():
            raise BadRequestError(
                "Ticker preflight failed before the LLM pipeline started.",
                details={"ticker": req.ticker, "reason": sanitize_message(str(exc))},
            ) from exc
        future.cancel()
        raise BadRequestError(
            "Ticker preflight timed out before the LLM pipeline started.",
            details={"ticker": req.ticker, "trade_date": req.trade_date},
        ) from exc
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
