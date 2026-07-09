from __future__ import annotations

import hashlib
import json
import logging
import queue
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from tradingagents import pipeline_balanced_debate as _debate
from tradingagents.agents.schemas import (
    DebateArgument,
    PortfolioDecision,
    PortfolioRating,
    SelfCritiqueResult,
    TraderAction,
    TraderProposal,
    render_debate_argument,
    render_pm_decision,
    render_trader_proposal,
)
from tradingagents.dataflows.providers.config import set_config
from tradingagents.dataflows.providers.y_finance import normalize_ticker
from tradingagents.graph.run_cache import SHORT_LIVED_TICKER_CACHE, RunCache
from tradingagents.llm.llm_router import apply_guardrail, llm_metadata
from tradingagents.llm_optimization.usage import get_usage_summary, reset_usage
from tradingagents.pipeline.orchestrator import (
    _normalize_time_horizon_months,
    _run_with_config,
    _time_horizon_label,
)
from tradingagents.pipeline.orchestrator import (
    collect_market_data as _collect_raw_market_data,
)
from tradingagents.pipeline_balanced_fallbacks import (
    _build_portfolio_manager_fallback,
)
from tradingagents.pipeline_balanced_llm import (
    _create_llms,
    _fallback_report,
    _invoke_once,
    _report_to_markdown,
    _research_plan_to_markdown,
    _risk_to_markdown,
)
from tradingagents.pipeline_balanced_progress import (
    _emit_data_quality,
    _emit_progress,
    _run_tracked,
)
from tradingagents.pipeline_balanced_prompts import (
    _get_context,
    fundamentals_prompt,
    market_analyst_prompt,
    news_social_prompt,
    portfolio_manager_prompt,
    research_manager_prompt,
    self_critique_prompt,
    trader_prompt,
)
from tradingagents.pipeline_balanced_types import (
    AnalystReport,
    CollectedData,
    LLMBudget,
    ProgressCallback,
    ResearchPlanLite,
    RiskCommitteeReport,
)
from tradingagents.trade_levels import DEFAULT_TARGET_RR, normalize_trade_levels

logger = logging.getLogger(__name__)

DEGRADED_BANNER = (
    "Analysis incomplete — one or more agents failed validation and used a "
    "placeholder result. Confidence is not reliable; rerun recommended."
)

PIPELINE_TIMING_ORDER = [
    "data_collection",
    "market_analyst",
    "news_analyst",
    "fundamentals",
    "bull_researcher",
    "bear_researcher",
    "research_manager",
    "trader",
    "risk_analysts",
    "portfolio_manager",
    "self_critique",
]


def _record_skipped_timing(
    timings: dict[str, dict[str, Any]],
    agent_id: str,
    name: str,
    reason: str,
) -> None:
    timings[agent_id] = {
        "name": name,
        "status": "skipped",
        "duration_seconds": 0.0,
        "warning": reason,
    }


def _build_agent_pipeline_rows(timings: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()

    def append_row(agent_id: str, timing: dict[str, Any]) -> None:
        status = str(timing.get("status") or "ok").lower()
        warning = str(timing.get("warning") or "").strip()
        if status == "skipped":
            output_summary = warning or "Skipped by the selected analysis mode."
        elif status in {"error", "failed", "fail"}:
            output_summary = warning or "Agent failed before producing a summary."
        else:
            output_summary = warning or "Completed successfully."

        rows.append(
            {
                "id": agent_id,
                "name": timing.get("name") or agent_id.replace("_", " ").title(),
                "status": status,
                "duration_seconds": timing.get("duration_seconds"),
                "output_summary": output_summary,
            }
        )
        seen.add(agent_id)

    for agent_id in PIPELINE_TIMING_ORDER:
        timing = timings.get(agent_id)
        if timing:
            append_row(agent_id, timing)

    for agent_id, timing in timings.items():
        if agent_id not in seen:
            append_row(agent_id, timing)

    return rows


def _analyst_data_hash(data: Any, context_key: str) -> str:
    """Hash the price/fundamentals snapshot an analyst reads (Phase 8 semantic guard).

    Coarser than the full prompt so semantic hits can match, but a changed snapshot
    yields a different hash → a stale view can never be served.
    """
    payload = json.dumps(_get_context(data, context_key), sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_initial_analyst_reports(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    quick_llm: Any,
    data,
    data_quality_json: str,
    time_horizon_text: str,
    llm_budget: LLMBudget,
    progress_callback: ProgressCallback | None,
    cancel_check: Callable[[], bool] | None,
    timings: dict[str, dict[str, Any]] | None = None,
) -> tuple[AnalystReport, AnalystReport, AnalystReport]:
    analyst_event_queue: queue.Queue[dict[str, Any] | None] = queue.Queue()
    analyst_forwarder: threading.Thread | None = None

    def _forward_analyst_events() -> None:
        while True:
            event = analyst_event_queue.get()
            try:
                if event is None:
                    return
                if progress_callback is not None:
                    progress_callback(event)
            except Exception as exc:
                logger.debug("Analyst progress forwarding failed: %s", exc)
            finally:
                analyst_event_queue.task_done()

    if progress_callback is not None:
        analyst_forwarder = threading.Thread(
            target=_forward_analyst_events,
            name="balanced-analyst-progress",
            daemon=True,
        )
        analyst_forwarder.start()

    def _queued_callback(event: dict) -> None:
        if progress_callback is not None:
            analyst_event_queue.put_nowait(event)

    def build_market_report_parallel() -> AnalystReport:
        return _run_tracked(
            _queued_callback,
            "market_analyst",
            "Market Analyst is reading price action and technical indicators...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                market_analyst_prompt(
                    ticker, trade_date, data, data_quality_json, time_horizon_text
                ),
                _fallback_report(
                    "Market Analyst Report",
                    f"Market data for {ticker} was collected, but the model did not return a "
                    "complete market view.",
                ),
                "Market Analyst",
                llm_budget,
                cancel_check,
                data_hash=_analyst_data_hash(data, "market"),
            ),
            timings=timings,
        )

    def build_news_social_report_parallel() -> AnalystReport:
        return _run_tracked(
            _queued_callback,
            "news_analyst",
            "News + Social Analyst is scanning company news, macro news, and insider activity...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                news_social_prompt(ticker, trade_date, data, data_quality_json, time_horizon_text),
                _fallback_report(
                    "News and Social Sentiment Report",
                    f"News and sentiment data for {ticker} was collected, but the model did not "
                    "return a complete sentiment view.",
                ),
                "News + Social Analyst",
                llm_budget,
                cancel_check,
            ),
            timings=timings,
        )

    def build_fundamentals_report_parallel() -> AnalystReport:
        return _run_tracked(
            _queued_callback,
            "fundamentals",
            "Fundamentals Analyst is reviewing financial statements and ratios...",
            lambda: _invoke_once(
                quick_llm,
                AnalystReport,
                fundamentals_prompt(ticker, trade_date, data, data_quality_json, time_horizon_text),
                _fallback_report(
                    "Fundamentals Analyst Report",
                    f"Fundamental data for {ticker} was collected, but the model did not return "
                    "a complete fundamental view.",
                ),
                "Fundamentals Analyst",
                llm_budget,
                cancel_check,
                data_hash=_analyst_data_hash(data, "fundamentals"),
            ),
            timings=timings,
        )

    try:
        analyst_workers = min(max(1, int(config.get("analyst_parallel_workers", 3))), 3)
        with ThreadPoolExecutor(
            max_workers=analyst_workers, thread_name_prefix="balanced-analyst"
        ) as pool:
            market_future = pool.submit(_run_with_config, config, build_market_report_parallel)
            news_future = pool.submit(_run_with_config, config, build_news_social_report_parallel)
            fundamentals_future = pool.submit(
                _run_with_config, config, build_fundamentals_report_parallel
            )
            return market_future.result(), news_future.result(), fundamentals_future.result()
    finally:
        if analyst_forwarder is not None:
            analyst_event_queue.put(None)
            analyst_event_queue.join()
            analyst_forwarder.join(timeout=1)


@dataclass(frozen=True)
class PipelineContext:
    ticker: str
    trade_date: str
    config: dict[str, Any]
    quick_llm: Any
    deep_llm: Any
    analysis_depth: str
    depth_config: dict[str, Any]
    depth_debate_rounds: int
    depth_risk_rounds: int
    extra_debate_rounds: int
    extra_risk_rounds: int
    time_horizon_months: int
    time_horizon_text: str
    llm_budget: LLMBudget
    pipeline_started_at: float
    pipeline_timings: dict[str, dict[str, Any]]
    progress_callback: ProgressCallback | None
    cancel_check: Callable[[], bool] | None
    has_existing_position: bool
    position_quantity: float | None
    average_entry_price: float | None
    deep_think_agents: frozenset[str] = frozenset()

    def llm_for(self, agent: str) -> Any:
        return self.deep_llm if agent in self.deep_think_agents else self.quick_llm


@dataclass(frozen=True)
class MarketDataStageResult:
    data: Any
    data_fetched_at: str
    data_quality_json: str
    last_close_text: str


@dataclass(frozen=True)
class AgentStageResult:
    market_report: AnalystReport
    news_social_report: AnalystReport
    fundamentals_report: AnalystReport
    market_md: str
    news_social_md: str
    fundamentals_md: str
    bull: DebateArgument
    bear: DebateArgument
    debate_history: list[str]
    debate_md: str
    investment_plan: str
    trader_plan: str
    risk_report: RiskCommitteeReport
    risk_md: str
    portfolio_decision: PortfolioDecision


@dataclass(frozen=True)
class PipelineMetrics:
    budget_snapshot: dict[str, Any]
    total_pipeline_seconds: float


def prepare_context(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    progress_callback: ProgressCallback | None = None,
    cancel_check: Callable[[], bool] | None = None,
    has_existing_position: bool = False,
    position_quantity: float | None = None,
    average_entry_price: float | None = None,
) -> PipelineContext:
    set_config(config)
    quick_llm, deep_llm = _create_llms(config)
    analysis_depth = str(config.get("analysis_depth", "balanced")).lower()
    depth_config = dict(config.get("analysis_depth_config") or {})
    depth_debate_rounds = max(
        1, int(depth_config.get("debate_rounds") or config.get("analysis_depth_debate_rounds") or 1)
    )
    depth_risk_rounds = max(
        1, int(depth_config.get("risk_rounds") or config.get("analysis_depth_risk_rounds") or 1)
    )
    extra_debate_rounds = max(0, depth_debate_rounds - 2) if analysis_depth == "deep" else 0
    extra_risk_rounds = max(0, depth_risk_rounds - 2) if analysis_depth == "deep" else 0
    time_horizon_months = _normalize_time_horizon_months(config.get("time_horizon_months", 1))
    time_horizon_text = _time_horizon_label(time_horizon_months)
    llm_budget = LLMBudget(
        int(config.get("max_total_llm_calls") or config.get("max_gemini_calls", 9))
    )
    pipeline_started_at = time.perf_counter()
    pipeline_timings: dict[str, dict[str, Any]] = {}
    return PipelineContext(
        ticker=ticker,
        trade_date=trade_date,
        config=config,
        quick_llm=quick_llm,
        deep_llm=deep_llm,
        analysis_depth=analysis_depth,
        depth_config=depth_config,
        depth_debate_rounds=depth_debate_rounds,
        depth_risk_rounds=depth_risk_rounds,
        extra_debate_rounds=extra_debate_rounds,
        extra_risk_rounds=extra_risk_rounds,
        time_horizon_months=time_horizon_months,
        time_horizon_text=time_horizon_text,
        llm_budget=llm_budget,
        pipeline_started_at=pipeline_started_at,
        pipeline_timings=pipeline_timings,
        progress_callback=progress_callback,
        cancel_check=cancel_check,
        has_existing_position=has_existing_position,
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
        deep_think_agents=frozenset(
            str(name).lower() for name in (config.get("deep_think_agents") or [])
        ),
    )


def collect_market_data(
    context: PipelineContext, cached_data: CollectedData | None = None
) -> MarketDataStageResult:
    ticker = context.ticker
    trade_date = context.trade_date
    config = context.config
    progress_callback = context.progress_callback
    cancel_check = context.cancel_check
    pipeline_timings = context.pipeline_timings
    _emit_progress(
        progress_callback,
        "news_fetch",
        "started",
        "Fetching normalized company news from configured providers...",
    )
    data = _run_tracked(
        progress_callback,
        "data_collection",
        "Collecting yfinance prices, indicators, fundamentals, news, and insider data...",
        lambda: (
            cached_data
            if cached_data is not None
            else _collect_raw_market_data(ticker, trade_date, config, cancel_check=cancel_check)
        ),
        cancel_check=cancel_check,
        timings=pipeline_timings,
    )
    _emit_progress(
        progress_callback,
        "news_fetch",
        "completed",
        "Normalized company news ready: "
        f"{(data.news_context or {}).get('articles_found', 0)} article(s).",
    )
    data_fetched_at = datetime.now(timezone.utc).isoformat()
    data_quality_json = json.dumps(data.data_quality.model_dump(), separators=(",", ":"))
    last_close_text = (
        f"{data.last_close_price:.2f}" if data.last_close_price is not None else "Unavailable"
    )
    _emit_data_quality(progress_callback, data.data_quality)

    return MarketDataStageResult(
        data=data,
        data_fetched_at=data_fetched_at,
        data_quality_json=data_quality_json,
        last_close_text=last_close_text,
    )


def run_agents(context: PipelineContext, data_stage: MarketDataStageResult) -> AgentStageResult:
    ticker = context.ticker
    trade_date = context.trade_date
    config = context.config
    quick_llm = context.quick_llm
    deep_llm = context.deep_llm
    time_horizon_text = context.time_horizon_text
    llm_budget = context.llm_budget
    pipeline_timings = context.pipeline_timings
    progress_callback = context.progress_callback
    cancel_check = context.cancel_check
    has_existing_position = context.has_existing_position
    position_quantity = context.position_quantity
    average_entry_price = context.average_entry_price
    data = data_stage.data
    data_quality_json = data_stage.data_quality_json
    last_close_text = data_stage.last_close_text
    market_report, news_social_report, fundamentals_report = _build_initial_analyst_reports(
        ticker,
        trade_date,
        config,
        quick_llm,
        data,
        data_quality_json,
        time_horizon_text,
        llm_budget,
        progress_callback,
        cancel_check,
        pipeline_timings,
    )

    market_md = _report_to_markdown(market_report)
    news_social_md = _report_to_markdown(news_social_report)
    fundamentals_md = _report_to_markdown(fundamentals_report)

    bull, bear, debate_history = _debate._run_debate_phase(
        context,
        market_report=market_report,
        news_social_report=news_social_report,
        fundamentals_report=fundamentals_report,
        market_md=market_md,
        news_social_md=news_social_md,
        fundamentals_md=fundamentals_md,
        data_quality_json=data_quality_json,
    )
    debate_md = "\n\n".join(debate_history)

    research_plan = _run_tracked(
        progress_callback,
        "research_manager",
        "Research Manager is weighing bull and bear arguments...",
        lambda: _invoke_once(
            deep_llm,
            ResearchPlanLite,
            research_manager_prompt(
                ticker,
                trade_date,
                time_horizon_text,
                market_md,
                news_social_md,
                fundamentals_md,
                debate_md,
                data_quality_json,
            ),
            ResearchPlanLite(
                recommendation=PortfolioRating.HOLD,
                confidence=0.35,
                rationale=(
                    "The evidence is incomplete or the research manager call failed, so the "
                    + "safest recommendation is Hold until the analysis is verified."
                ),
                strategic_actions=(
                    "Avoid new exposure until data quality, model output, and key risk/reward "
                    + "assumptions are reviewed."
                ),
            ),
            "Research Manager",
            llm_budget,
            cancel_check,
        ),
        timings=pipeline_timings,
    )
    investment_plan = _research_plan_to_markdown(research_plan)

    trader_proposal = _run_tracked(
        progress_callback,
        "trader",
        "Trader is turning the plan into trade execution guidance...",
        lambda: _invoke_once(
            quick_llm,
            TraderProposal,
            trader_prompt(
                ticker, trade_date, time_horizon_text, market_md, investment_plan, data_quality_json
            ),
            TraderProposal(
                confidence=0.35,
                action=TraderAction.HOLD,
                reasoning=(
                    "The balanced pipeline could not generate a reliable trader proposal, so no "
                    + "new trade should be opened."
                ),
                entry_price=None,
                stop_loss=None,
                suggested_allocation_percent=0.0,
                position_sizing="0% new allocation until reviewed.",
                position_sizing_reason="Fallback output used; no reliable trade sizing available.",
                rebalancing_action="Maintain position",
                key_catalysts=[],
                invalidation_conditions=["Data quality or model output cannot be verified."],
            ),
            "Trader",
            llm_budget,
            cancel_check,
        ),
        timings=pipeline_timings,
    )
    trader_plan = render_trader_proposal(trader_proposal)

    risk_report = _debate._run_risk_phase(
        context,
        data=data,
        market_report=market_report,
        news_social_report=news_social_report,
        fundamentals_report=fundamentals_report,
        market_md=market_md,
        news_social_md=news_social_md,
        fundamentals_md=fundamentals_md,
        debate_md=debate_md,
        investment_plan=investment_plan,
        trader_plan=trader_plan,
        data_quality_json=data_quality_json,
    )
    risk_md = _risk_to_markdown(risk_report)

    portfolio_decision = _run_tracked(
        progress_callback,
        "portfolio_manager",
        "Portfolio Manager is preparing the final dashboard decision...",
        lambda: _invoke_once(
            deep_llm,
            PortfolioDecision,
            portfolio_manager_prompt(
                ticker,
                trade_date,
                time_horizon_text,
                last_close_text,
                market_md,
                news_social_md,
                fundamentals_md,
                debate_md,
                investment_plan,
                trader_plan,
                risk_md,
                data_quality_json,
            ),
            _build_portfolio_manager_fallback(
                ticker=ticker,
                trade_date=trade_date,
                time_horizon_text=time_horizon_text,
                data=data,
                has_existing_position=bool(has_existing_position),
                position_quantity=position_quantity,
                average_entry_price=average_entry_price,
            ),
            "Portfolio Manager",
            llm_budget,
            cancel_check,
        ),
        timings=pipeline_timings,
    )

    return AgentStageResult(
        market_report=market_report,
        news_social_report=news_social_report,
        fundamentals_report=fundamentals_report,
        market_md=market_md,
        news_social_md=news_social_md,
        fundamentals_md=fundamentals_md,
        bull=bull,
        bear=bear,
        debate_history=debate_history,
        debate_md=debate_md,
        investment_plan=investment_plan,
        trader_plan=trader_plan,
        risk_report=risk_report,
        risk_md=risk_md,
        portfolio_decision=portfolio_decision,
    )


def aggregate_decision(
    context: PipelineContext,
    data_stage: MarketDataStageResult,
    agent_stage: AgentStageResult,
) -> PortfolioDecision:
    ticker = context.ticker
    has_existing_position = context.has_existing_position
    position_quantity = context.position_quantity
    average_entry_price = context.average_entry_price
    data = data_stage.data
    portfolio_decision = agent_stage.portfolio_decision
    portfolio_decision = normalize_trade_levels(
        portfolio_decision,
        current_price=data.last_close_price,
        ticker=ticker,
        current_price_as_of=data.last_close_price_as_of,
        current_price_source=data.last_close_price_source
        if data.last_close_price is not None
        else None,
        has_existing_position=bool(has_existing_position),
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
        price_data=data.price_data,
        data_quality=data.data_quality.model_dump(),
        target_risk_reward=context.config.get("target_risk_reward", DEFAULT_TARGET_RR),
    )
    safety_context = getattr(data, "safety_prompt_context", None)
    if safety_context is not None:
        guarded_action, guardrail_warnings = apply_guardrail(
            safety_context, _decision_action(portfolio_decision)
        )
        if guardrail_warnings:
            _append_guardrail_warnings(data, portfolio_decision, guardrail_warnings)
        if guarded_action == "WAIT" and _decision_action(portfolio_decision) in {"BUY", "SELL"}:
            _downgrade_decision_to_wait(
                portfolio_decision, guardrail_warnings, has_existing_position
            )

    return portfolio_decision


def _decision_action(decision: PortfolioDecision) -> str:
    raw = (
        getattr(decision, "final_decision", None)
        or getattr(decision, "decision", None)
        or getattr(getattr(decision, "rating", None), "value", None)
        or getattr(decision, "rating", None)
        or "Hold"
    )
    normalized = str(raw).strip().upper()
    if normalized == "OVERWEIGHT":
        return "BUY"
    if normalized == "UNDERWEIGHT":
        return "SELL"
    if normalized in {"BUY", "SELL"}:
        return normalized
    return "WAIT"


def _append_guardrail_warnings(data: Any, decision: PortfolioDecision, warnings: list[str]) -> None:
    existing_quality_warnings = list(getattr(data.data_quality, "warnings", []) or [])
    data.data_quality.warnings = list(dict.fromkeys([*existing_quality_warnings, *warnings]))[:20]
    existing_data_warnings = list(getattr(data, "warnings", []) or [])
    data.warnings = list(dict.fromkeys([*existing_data_warnings, *warnings]))[:20]
    decision.validation_warnings = list(
        dict.fromkeys([*(decision.validation_warnings or []), *warnings])
    )[:20]


def _downgrade_decision_to_wait(
    decision: PortfolioDecision,
    warnings: list[str],
    has_existing_position: bool,
) -> None:
    reason = next(
        (warning for warning in warnings if "Action downgraded" in warning),
        warnings[0] if warnings else None,
    )
    decision.rating = PortfolioRating.HOLD
    decision.decision = "Hold"
    decision.final_decision = "Hold"
    decision.decision_adjusted = True
    decision.decision_adjusted_reason = reason
    decision.trade_plan_valid = False
    decision.suggested_allocation_percent = 0.0
    decision.entry_price = None
    decision.stop_loss = None
    decision.take_profit = None
    decision.risk_reward_ratio = None
    decision.risk_reward_display = None
    decision.risk_per_share = None
    decision.reward_per_share = None
    decision.rebalancing_action = (
        "Maintain position" if has_existing_position else "No position to rebalance"
    )
    decision.new_entry_action = "Wait for valid entry setup"
    decision.position_size_hint = (
        "Maintain current position size; no additional exposure suggested."
        if has_existing_position
        else "0% allocation until setup improves."
    )


def run_self_critique(
    context: PipelineContext,
    data_stage: MarketDataStageResult,
    decision: PortfolioDecision,
) -> PortfolioDecision:
    """9A: adversarial review of the final decision, deep depth only.

    One deep_llm call flags a decision that contradicts its inputs, overstates confidence,
    or leans on missing data, then downgrades a Buy/Sell to a cautious Hold. Budget-gated:
    `_invoke_once` consumes `LLMBudget` and returns the no-op fallback when exhausted.
    """
    if context.analysis_depth != "deep":
        return decision
    if _decision_action(decision) not in {"BUY", "SELL"}:
        # A Hold has nothing to downgrade; skip the call and its budget cost.
        return decision

    critique = _run_tracked(
        context.progress_callback,
        "self_critique",
        "Independent reviewer is auditing the final decision...",
        lambda: _invoke_once(
            context.deep_llm,
            SelfCritiqueResult,
            self_critique_prompt(
                context.ticker,
                context.trade_date,
                context.time_horizon_text,
                render_pm_decision(decision),
                data_stage.data_quality_json,
            ),
            SelfCritiqueResult(should_downgrade=False, violations=[]),
            "Self-Critique",
            context.llm_budget,
            context.cancel_check,
        ),
        timings=context.pipeline_timings,
    )

    if critique.should_downgrade and critique.violations:
        warnings = [f"Self-critique: {v}" for v in critique.violations][:5]
        _append_guardrail_warnings(data_stage.data, decision, warnings)
        _downgrade_decision_to_wait(decision, warnings, context.has_existing_position)
    return decision


def persist_metrics(context: PipelineContext) -> PipelineMetrics:
    llm_budget = context.llm_budget
    pipeline_started_at = context.pipeline_started_at
    budget_snapshot = llm_budget.snapshot()
    total_pipeline_seconds = round(time.perf_counter() - pipeline_started_at, 1)

    return PipelineMetrics(
        budget_snapshot=budget_snapshot,
        total_pipeline_seconds=total_pipeline_seconds,
    )


_DATA_STATUS_SCORE = {"ok": 1.0, "market_closed": 0.8, "partial": 0.5, "stale": 0.4}
CONFIDENCE_DIVERGENCE_THRESHOLD = 0.2


def reconcile_confidence(
    pm_confidence: float,
    *,
    analyst_confidences: list[float],
    data_status: tuple[str, str, str],
    bull_confidence: float,
    bear_confidence: float,
    budget_partial: bool,
    threshold: float = CONFIDENCE_DIVERGENCE_THRESHOLD,
) -> tuple[float, bool, str | None]:
    """Down-clamp an over-confident PM score against data quality + debate spread.

    Pure post-processing, no LLM call. Only ever lowers confidence.
    """
    completeness = sum(_DATA_STATUS_SCORE.get(str(s).lower(), 0.0) for s in data_status) / 3
    analyst = (
        sum(analyst_confidences) / len(analyst_confidences)
        if analyst_confidences
        else pm_confidence
    )
    # High when bull and bear land near the same conviction; a wide spread = unresolved debate.
    agreement = 1.0 - min(1.0, abs(bull_confidence - bear_confidence))
    derived = (completeness + analyst + agreement) / 3
    if budget_partial:
        # ponytail: a budget-truncated run can't earn high confidence; hard cap.
        derived = min(derived, 0.4)
    if pm_confidence - derived <= threshold:
        return pm_confidence, False, None
    reasons = []
    if completeness < 0.7:
        reasons.append("thin/stale data")
    if agreement < 0.7:
        reasons.append("unresolved bull/bear debate")
    if budget_partial:
        reasons.append("incomplete LLM budget")
    reason = "Confidence clamped from {:.2f} to {:.2f}: {}".format(
        pm_confidence, derived, ", ".join(reasons) or "diverged from data-derived estimate"
    )
    return round(derived, 4), True, reason


def build_response(
    context: PipelineContext,
    data_stage: MarketDataStageResult,
    agent_stage: AgentStageResult,
    portfolio_decision: PortfolioDecision,
    metrics: PipelineMetrics,
) -> dict[str, Any]:
    ticker = context.ticker
    trade_date = context.trade_date
    time_horizon_months = context.time_horizon_months
    time_horizon_text = context.time_horizon_text
    analysis_depth = context.analysis_depth
    depth_config = context.depth_config
    depth_debate_rounds = context.depth_debate_rounds
    depth_risk_rounds = context.depth_risk_rounds
    extra_risk_rounds = context.extra_risk_rounds
    llm_budget = context.llm_budget
    pipeline_timings = context.pipeline_timings
    data = data_stage.data
    data_fetched_at = data_stage.data_fetched_at
    market_md = agent_stage.market_md
    news_social_md = agent_stage.news_social_md
    fundamentals_md = agent_stage.fundamentals_md
    bull = agent_stage.bull
    bear = agent_stage.bear
    debate_history = agent_stage.debate_history
    debate_md = agent_stage.debate_md
    investment_plan = agent_stage.investment_plan
    trader_plan = agent_stage.trader_plan
    risk_report = agent_stage.risk_report
    risk_md = agent_stage.risk_md
    budget_snapshot = metrics.budget_snapshot
    llm_call_summary = {
        "analysis_depth": analysis_depth,
        "used": budget_snapshot["used"],
        "max": budget_snapshot["max"],
        **llm_metadata(context.config),
        "budget_source": "env",
        "agents": budget_snapshot.get("agents", {}),
        "warnings": budget_snapshot.get("warnings", []),
    }
    vendor_budget = dict(data.request_budget or {})
    vendor_budget["llm_calls"] = llm_call_summary
    response_warnings = list(data.warnings or [])
    for warning in budget_snapshot.get("warnings", []):
        code = warning.get("code") if isinstance(warning, dict) else None
        if code:
            response_warnings.append(str(code))
        message = warning.get("message") if isinstance(warning, dict) else str(warning)
        if message:
            response_warnings.append(message)
    total_pipeline_seconds = metrics.total_pipeline_seconds
    llm_usage_summary = get_usage_summary()
    degraded = any(
        (bucket or {}).get("fallbacks") for bucket in llm_usage_summary.get("agents", {}).values()
    )
    budget_partial = "Portfolio Manager" in set(budget_snapshot.get("agents_skipped", []))
    reconciled_confidence, confidence_reconciled, confidence_reconciled_reason = (
        reconcile_confidence(
            float(getattr(portfolio_decision, "confidence_score", 0.0) or 0.0),
            analyst_confidences=[
                agent_stage.market_report.confidence,
                agent_stage.news_social_report.confidence,
                agent_stage.fundamentals_report.confidence,
            ],
            data_status=(
                data.data_quality.price_data,
                data.data_quality.fundamentals,
                data.data_quality.news,
            ),
            bull_confidence=bull.confidence,
            bear_confidence=bear.confidence,
            budget_partial=budget_partial,
        )
    )
    if confidence_reconciled:
        portfolio_decision.confidence_score = reconciled_confidence
    limitations = list(data.data_limitations or [])
    partial_fields = (
        {
            "is_partial": True,
            "partial_reason": "llm_budget_exceeded",
            "completed_stages": [
                "symbol_resolution",
                "market_data_fetch",
                "technical_analysis",
                "news_analysis",
                "fundamental_analysis",
            ],
            "missing_stages": ["final_synthesis"],
            "partial_signal": "WAIT",
            "partial_confidence": 0,
            "available_data": {
                "price": data.last_close_price is not None,
                "technical": bool(data.technical_entry),
                "news": bool(
                    (data.news_context or {}).get("top_articles")
                    or (data.news_context or {}).get("articles")
                ),
                "fundamental": bool(data.normalized_period_rows or data.financial_highlights),
                "ai_signal": False,
            },
        }
        if budget_partial
        else {"is_partial": False}
    )
    if budget_partial:
        limitations.append("Final synthesis was not completed because LLM budget was exhausted.")
    return {
        "company_of_interest": ticker,
        "trade_date": trade_date,
        "time_horizon_months": time_horizon_months,
        "time_horizon": time_horizon_text,
        "market_report": market_md,
        "sentiment_report": news_social_md,
        "news_report": news_social_md,
        "fundamentals_report": fundamentals_md,
        "investment_debate_state": {
            "bull_history": render_debate_argument(bull, "Bull Researcher"),
            "bear_history": render_debate_argument(bear, "Bear Researcher"),
            "history": debate_md,
            "judge_decision": investment_plan,
            "count": len(debate_history),
        },
        "investment_plan": investment_plan,
        "trader_investment_plan": trader_plan,
        "risk_debate_state": {
            "aggressive_history": risk_report.aggressive_view,
            "neutral_history": risk_report.neutral_view,
            "conservative_history": risk_report.conservative_view,
            "history": risk_md,
            "judge_decision": risk_md,
            "count": 3 + (3 * extra_risk_rounds),
        },
        "portfolio_decision": portfolio_decision,
        "data_quality": data.data_quality.model_dump(),
        "data_sources": data.data_sources or {},
        "data_limitations": data.data_limitations or [],
        "limitations": list(dict.fromkeys(limitations)),
        "field_sources": data.field_sources or {},
        "validation_summary": data.validation_summary or {},
        "warnings": list(dict.fromkeys(response_warnings)),
        "vendor_attempts": data.vendor_attempts or {},
        "request_budget": data.request_budget or {},
        "vendor_budget": vendor_budget,
        "data_freshness": data.data_freshness or {},
        "data_completeness": data.data_completeness or {},
        "fundamental_gap_report": data.fundamental_gap_report or {},
        "normalized_period_rows": data.normalized_period_rows or [],
        "derived_fundamentals": data.derived_fundamentals or [],
        "financial_highlights": data.financial_highlights,
        **(data.fundamental_analysis or {}),
        "company_profile": data.company_profile
        or {
            "available": False,
            "ticker": ticker,
            "warning": "Company profile was not collected.",
        },
        "price_chart": data.price_chart or {},
        "price_performance": data.price_performance or {},
        "technical_entry": data.technical_entry or {},
        "related_news": data.related_news or {},
        "news_impact": data.news_impact or {},
        "catalyst_tracker": data.catalyst_tracker or {},
        "analyst_consensus": data.analyst_consensus or {},
        "news": data.news_context or {},
        "news_context": data.news_context or {},
        "data_fetched_at": data_fetched_at,
        "last_close_price": data.last_close_price,
        "last_close_price_as_of": data.last_close_price_as_of,
        "last_close_price_source": data.last_close_price_source
        if data.last_close_price is not None
        else None,
        "price_source": data.last_close_price_source if data.last_close_price is not None else None,
        "price_timestamp": data.last_close_price_as_of
        if data.last_close_price is not None
        else None,
        "price_is_fallback": bool(data.last_close_price_is_fallback),
        "analysis_depth": analysis_depth,
        "analysis_depth_config": depth_config,
        "analysis_depth_debate_rounds": depth_debate_rounds,
        "analysis_depth_risk_rounds": depth_risk_rounds,
        "balanced_gemini_request_budget": llm_budget.limit,
        "balanced_gemini_calls_used": budget_snapshot["used"],
        "llm_call_budget": llm_budget.limit,
        "llm_calls_used": budget_snapshot["used"],
        "budget_exhausted": budget_snapshot["budget_exhausted"],
        "agents_skipped": budget_snapshot["agents_skipped"],
        "agent_pipeline": _build_agent_pipeline_rows(pipeline_timings),
        "total_pipeline_seconds": total_pipeline_seconds,
        "llm_usage": llm_usage_summary,
        "degraded": degraded,
        "degraded_reason": DEGRADED_BANNER if degraded else None,
        "confidence_reconciled": confidence_reconciled,
        "confidence_reconciled_reason": confidence_reconciled_reason,
        **partial_fields,
    }


def run_balanced_pipeline(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    progress_callback: ProgressCallback | None = None,
    cancel_check: Callable[[], bool] | None = None,
    has_existing_position: bool = False,
    position_quantity: float | None = None,
    average_entry_price: float | None = None,
) -> dict[str, Any]:
    """Run the balanced pipeline through explicit maintainable stages."""
    reset_usage()
    normalized_ticker = normalize_ticker(ticker)
    cached_data = SHORT_LIVED_TICKER_CACHE.get(normalized_ticker, trade_date)
    run_cache = RunCache(
        str(
            config.get("job_id")
            or config.get("request_id")
            or f"{ticker}:{trade_date}:{time.perf_counter_ns()}"
        )
    )
    run_config = dict(config)
    run_config["_run_cache"] = run_cache
    try:
        context = prepare_context(
            ticker=ticker,
            trade_date=trade_date,
            config=run_config,
            progress_callback=progress_callback,
            cancel_check=cancel_check,
            has_existing_position=has_existing_position,
            position_quantity=position_quantity,
            average_entry_price=average_entry_price,
        )
        data_stage = collect_market_data(context, cached_data=cached_data)
        if cached_data is None:
            SHORT_LIVED_TICKER_CACHE.set(normalized_ticker, trade_date, data_stage.data)
        agent_stage = run_agents(context, data_stage)
        portfolio_decision = aggregate_decision(context, data_stage, agent_stage)
        portfolio_decision = run_self_critique(context, data_stage, portfolio_decision)
        metrics = persist_metrics(context)
        return build_response(context, data_stage, agent_stage, portfolio_decision, metrics)
    finally:
        run_cache.clear()
