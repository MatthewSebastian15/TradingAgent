from __future__ import annotations

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

from tradingagents.agents.schemas import (
    DebateArgument,
    PortfolioDecision,
    PortfolioRating,
    TraderAction,
    TraderProposal,
    VolatilityLevel,
    render_debate_argument,
    render_trader_proposal,
)
from tradingagents.dataflows.config import set_config
from tradingagents.graph.run_cache import RunCache
from tradingagents.llm.LLM_router import apply_guardrail, llm_metadata
from tradingagents.pipeline_balanced_data import (
    _normalize_time_horizon_months,
    _run_with_config,
    _time_horizon_label,
)
from tradingagents.pipeline_balanced_data import (
    collect_market_data as _collect_raw_market_data,
)
from tradingagents.pipeline_balanced_llm import (
    _create_llms,
    _fallback_report,
    _invoke_once,
    _report_to_markdown,
    _research_plan_to_markdown,
    _risk_to_markdown,
)
from tradingagents.pipeline_balanced_progress import _emit_data_quality, _emit_progress, _run_tracked
from tradingagents.pipeline_balanced_prompts import (
    bear_prompt,
    bull_prompt,
    fundamentals_prompt,
    market_analyst_prompt,
    news_social_prompt,
    portfolio_manager_prompt,
    research_manager_prompt,
    risk_committee_prompt,
    trader_prompt,
)
from tradingagents.pipeline_balanced_types import (
    AnalystReport,
    LLMBudget,
    ProgressCallback,
    ResearchPlanLite,
    RiskCommitteeReport,
)
from tradingagents.trade_levels import normalize_trade_levels

logger = logging.getLogger(__name__)

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


def _limit_unique_text_items(items: list[str], limit: int = 5) -> list[str]:
    """Return a de-duplicated, trimmed list that is safe for bounded schemas."""
    cleaned: list[str] = []
    seen: set[str] = set()

    for item in items or []:
        text = str(item).strip()
        if not text or text in seen:
            continue

        seen.add(text)
        cleaned.append(text)

        if len(cleaned) >= limit:
            break

    return cleaned


def _fallback_portfolio_executive_summary(ticker: str, time_horizon_text: str) -> str:
    """Return a schema-valid fallback executive summary.

    PortfolioDecision enforces a 250-300 word range. Keep this fallback inside
    that range so a failed or malformed LLM response never crashes the job while
    constructing the local safety decision.
    """
    return (
        f"The final rating for {ticker} is Hold because the pipeline could not produce a fully validated portfolio decision, and protecting capital is safer than forcing a trade from incomplete evidence. "
        "The most important reason is process reliability: a recommendation is only useful when price, fundamentals, risk controls, and final model output all pass validation together.\n\n"
        "Recent price action should therefore be treated as context, not as permission to enter. The system may have collected market and news inputs, but a failed final decision layer can hide stale prices, missing provider responses, or unsupported trade levels. "
        "Any movement that appears attractive must be separated from a verified fundamental driver.\n\n"
        "Fundamental interpretation also needs caution. Revenue trend, profitability, cash flow, and balance sheet quality may have partial signals, yet the fallback path means those signals were not converted into a clean dashboard-ready decision. "
        "Financial health should be reviewed again after provider calls and structured output complete normally.\n\n"
        "The overall risk level is High because data quality and model completeness are both uncertain. The top risks are acting on partial vendor data and relying on a shortened or malformed final thesis. "
        "Either risk can make allocation, stop-loss, take-profit, and risk/reward fields misleading.\n\n"
        f"The immediate action is to avoid new exposure for the selected {time_horizon_text} horizon, keep allocation at zero for new trades, and rerun the analysis after the backend returns a clean structured result. "
        "Existing holders should maintain or reduce risk only through their own verified plan, not this fallback message."
    )


def _fallback_portfolio_investment_thesis(ticker: str, time_horizon_text: str) -> str:
    """Return a schema-valid fallback investment thesis.

    PortfolioDecision enforces a 400-450 word range. This deterministic thesis
    keeps the pipeline alive when the Portfolio Manager model returns short,
    invalid, or unparseable content.
    """
    return (
        f"{ticker} should stay on Hold until the analysis can be verified because the fallback path is a process signal, not a market conviction signal. "
        "The company may have a valid business, liquid trading, and useful public disclosures, but the final portfolio layer did not produce a clean structured answer. "
        "A dashboard recommendation must connect business context, price behavior, fundamentals, technical levels, risk controls, and data quality. When that chain breaks, the responsible conclusion is patience.\n\n"
        "Recent price movement should be read conservatively. The market report may show momentum, reversal, support, or resistance, yet the final decision cannot assume that movement is fundamentally supported when vendor calls or schema validation failed. "
        "A speculative move can look impressive on a chart while still offering poor entry quality. The application should therefore avoid converting partial price evidence into entry, stop-loss, or take-profit numbers that appear more precise than the source data allows.\n\n"
        "The fundamental view also remains provisional. Revenue growth, net profit, margins, cash flow quality, debt, liquidity, and shareholder context should be reviewed from official or higher-priority vendors before conviction is raised. "
        "If those numbers are available, they should support the thesis with period labels and source metadata. If they are missing or inconsistent, the result should reduce confidence rather than invent certainty. "
        "In this fallback case, financial health is not rejected, but it is not strong enough to override validation risk.\n\n"
        "Technical interpretation has the same limitation. Support, resistance, trend direction, volume confirmation, and moving-average behavior can help only when the current price anchor is reliable. "
        "Without a clean price source, any trade level can become cosmetic. A valid Buy would require an entry with a stop below it and a take-profit that preserves exactly 1:3 risk/reward. "
        "A valid Sell would need the opposite structure. If that cannot be validated, Hold or Avoid new entry is the only defensible action.\n\n"
        "The risk assessment is High because the main threat is not simply market volatility; it is decision quality. The top macro risk is broad market weakness, the sector risk is a shift in liquidity or sentiment against comparable stocks, and the company-specific risk is acting before official fundamentals and quote data reconcile. "
        "These risks are made worse when model output is too short, malformed, or repaired by fallback rules.\n\n"
        f"The final positioning for the selected {time_horizon_text} horizon is to open no new exposure, keep suggested allocation at zero, and wait for a clean rerun. "
        "The thesis could be upgraded if provider calls complete, official fundamentals reconcile, price data is fresh, and the model returns a validated thesis with actionable risk controls. "
        "It should be downgraded if data remains missing, price breaks support, or risk/reward cannot be validated."
    )


def _build_portfolio_manager_fallback(
    *,
    ticker: str,
    trade_date: str,
    time_horizon_text: str,
    data: Any,
    has_existing_position: bool,
    position_quantity: float | None,
    average_entry_price: float | None,
) -> PortfolioDecision:
    """Build a safe PortfolioDecision fallback that satisfies strict schema validators."""
    return PortfolioDecision(
        confidence_score=0.35,
        rating=PortfolioRating.HOLD,
        executive_summary=_fallback_portfolio_executive_summary(ticker, time_horizon_text),
        investment_thesis=_fallback_portfolio_investment_thesis(ticker, time_horizon_text),
        suggested_allocation_percent=0.0,
        entry_price=None,
        stop_loss=None,
        take_profit=None,
        risk_reward_ratio=None,
        max_drawdown_estimate="Not estimated because final output used fallback.",
        volatility_level=VolatilityLevel.HIGH,
        position_sizing_reason="Fallback output and/or incomplete data quality require zero new allocation.",
        rebalancing_action="Maintain position" if has_existing_position else "No position to rebalance",
        key_catalysts=[],
        key_reasons=[
            "The final Portfolio Manager response could not be validated, so the backend used a conservative safety fallback.",
            "Provider or model output should be rerun before any new entry, stop-loss, take-profit, or allocation is trusted.",
        ],
        invalidation_conditions=["Clean data and clean model output are not available."],
        price_target=None,
        time_horizon=time_horizon_text,
        current_price=data.last_close_price,
        current_price_as_of=data.last_close_price_as_of or trade_date,
        current_price_source=data.last_close_price_source if data.last_close_price is not None else None,
        llm_decision="Hold",
        final_decision="Hold",
        decision="Hold",
        trade_plan_valid=False,
        has_existing_position=bool(has_existing_position),
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
        data_quality={
            "price_data": "ok" if data.last_close_price is not None else "missing",
            "trade_levels": "invalid",
            "llm_output": "fallback",
            "volatility_data": "missing",
        },
        validation_warnings=[
            "Portfolio Manager output used schema-safe fallback because the model response was invalid, short, or unavailable."
        ],
    )


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
                market_analyst_prompt(ticker, trade_date, data, data_quality_json, time_horizon_text),
                _fallback_report(
                    "Market Analyst Report",
                    f"Market data for {ticker} was collected, but the model did not return a complete market view.",
                ),
                "Market Analyst",
                llm_budget,
                cancel_check,
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
                    f"News and sentiment data for {ticker} was collected, but the model did not return a complete sentiment view.",
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
                    f"Fundamental data for {ticker} was collected, but the model did not return a complete fundamental view.",
                ),
                "Fundamentals Analyst",
                llm_budget,
                cancel_check,
            ),
            timings=timings,
        )

    try:
        analyst_workers = min(max(1, int(config.get("analyst_parallel_workers", 3))), 3)
        with ThreadPoolExecutor(max_workers=analyst_workers, thread_name_prefix="balanced-analyst") as pool:
            market_future = pool.submit(_run_with_config, config, build_market_report_parallel)
            news_future = pool.submit(_run_with_config, config, build_news_social_report_parallel)
            fundamentals_future = pool.submit(_run_with_config, config, build_fundamentals_report_parallel)
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
    depth_risk_rounds = max(1, int(depth_config.get("risk_rounds") or config.get("analysis_depth_risk_rounds") or 1))
    extra_debate_rounds = max(0, depth_debate_rounds - 2) if analysis_depth == "deep" else 0
    extra_risk_rounds = max(0, depth_risk_rounds - 2) if analysis_depth == "deep" else 0
    time_horizon_months = _normalize_time_horizon_months(config.get("time_horizon_months", 1))
    time_horizon_text = _time_horizon_label(time_horizon_months)
    llm_budget = LLMBudget(int(config.get("max_total_llm_calls") or config.get("max_gemini_calls", 9)))
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
    )


def collect_market_data(context: PipelineContext) -> MarketDataStageResult:
    ticker = context.ticker
    trade_date = context.trade_date
    config = context.config
    progress_callback = context.progress_callback
    cancel_check = context.cancel_check
    pipeline_timings = context.pipeline_timings
    _emit_progress(
        progress_callback, "news_fetch", "started", "Fetching normalized company news from configured providers..."
    )
    data = _run_tracked(
        progress_callback,
        "data_collection",
        "Collecting yfinance prices, indicators, fundamentals, news, and insider data...",
        lambda: _collect_raw_market_data(ticker, trade_date, config, cancel_check=cancel_check),
        cancel_check=cancel_check,
        timings=pipeline_timings,
    )
    _emit_progress(
        progress_callback,
        "news_fetch",
        "completed",
        f"Normalized company news ready: {(data.news_context or {}).get('articles_found', 0)} article(s).",
    )
    data_fetched_at = datetime.now(timezone.utc).isoformat()
    data_quality_json = json.dumps(data.data_quality.model_dump(), indent=2)
    last_close_text = f"{data.last_close_price:.2f}" if data.last_close_price is not None else "Unavailable"
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
    analysis_depth = context.analysis_depth
    extra_debate_rounds = context.extra_debate_rounds
    extra_risk_rounds = context.extra_risk_rounds
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

    debate_history: list[str] = []

    if analysis_depth == "fast":
        _emit_progress(progress_callback, "bull_researcher", "completed", "Bull debate skipped in fast mode.")
        _emit_progress(progress_callback, "bear_researcher", "completed", "Bear debate skipped in fast mode.")
        _record_skipped_timing(
            pipeline_timings,
            "bull_researcher",
            "Bull Researcher",
            "Skipped in fast mode to reduce LLM calls.",
        )
        _record_skipped_timing(
            pipeline_timings,
            "bear_researcher",
            "Bear Researcher",
            "Skipped in fast mode to reduce LLM calls.",
        )
        bull = DebateArgument(
            stance="bull",
            thesis=f"Fast mode uses the analyst reports directly for {ticker} instead of a separate bull debate.",
            evidence=["Market report completed.", "News/social report completed.", "Fundamentals report completed."],
            counterargument="Fast mode has less debate depth than balanced/deep mode.",
            risk_flags=["Debate skipped to reduce LLM calls."],
            confidence=max(
                0.25,
                min(
                    0.75,
                    (market_report.confidence + news_social_report.confidence + fundamentals_report.confidence) / 3,
                ),
            ),
            consensus_signal=False,
        )
        bear = DebateArgument(
            stance="bear",
            thesis=f"Fast mode keeps downside assumptions conservative for {ticker} because no separate bear debate was run.",
            evidence=["Risk is inferred from analyst report risk sections.", "Data quality warnings are preserved."],
            counterargument="Balanced/deep mode should be used before high-conviction trades.",
            risk_flags=_limit_unique_text_items(
                market_report.risks + news_social_report.risks + fundamentals_report.risks,
                limit=5,
            ),
            confidence=0.45,
            consensus_signal=False,
        )
        debate_history.extend(
            [
                render_debate_argument(bull, "Bull Researcher"),
                render_debate_argument(bear, "Bear Researcher"),
            ]
        )
    else:
        bull = _run_tracked(
            progress_callback,
            "bull_researcher",
            "Bull Researcher is building the upside case...",
            lambda: _invoke_once(
                quick_llm,
                DebateArgument,
                bull_prompt(
                    ticker,
                    trade_date,
                    time_horizon_text,
                    data_quality_json,
                    market_md,
                    news_social_md,
                    fundamentals_md,
                ),
                DebateArgument(
                    stance="bull",
                    thesis=f"The bullish case for {ticker} is not strong enough to rate confidently because model output failed.",
                    evidence=[
                        "Market, news, and fundamental reports were collected.",
                        "A complete bullish argument was not generated.",
                    ],
                    counterargument="The absence of a reliable bullish argument weakens any aggressive buy decision.",
                    risk_flags=["Model output fallback used."],
                    confidence=0.35,
                    consensus_signal=False,
                ),
                "Bull Researcher",
                llm_budget,
                cancel_check,
            ),
            timings=pipeline_timings,
        )

        bear = _run_tracked(
            progress_callback,
            "bear_researcher",
            "Bear Researcher is challenging the thesis...",
            lambda: _invoke_once(
                quick_llm,
                DebateArgument,
                bear_prompt(
                    ticker,
                    trade_date,
                    time_horizon_text,
                    data_quality_json,
                    market_md,
                    news_social_md,
                    fundamentals_md,
                    bull,
                ),
                DebateArgument(
                    stance="bear",
                    thesis=f"The bearish case for {ticker} is incomplete because model output failed, so risk should be treated cautiously.",
                    evidence=[
                        "Market, news, and fundamental reports were collected.",
                        "A complete bearish argument was not generated.",
                    ],
                    counterargument="Without a reliable bear case, the final decision should avoid overconfidence.",
                    risk_flags=["Model output fallback used."],
                    confidence=0.35,
                    consensus_signal=False,
                ),
                "Bear Researcher",
                llm_budget,
                cancel_check,
            ),
            timings=pipeline_timings,
        )
        debate_history.extend(
            [
                render_debate_argument(bull, "Bull Researcher"),
                render_debate_argument(bear, "Bear Researcher"),
            ]
        )

        for round_number in range(2, extra_debate_rounds + 2):
            bull = _run_tracked(
                progress_callback,
                "bull_researcher",
                f"Deep mode bull review round {round_number} is refining the upside case...",
                lambda round_number=round_number: _invoke_once(
                    quick_llm,
                    DebateArgument,
                    bull_prompt(
                        ticker,
                        trade_date,
                        time_horizon_text,
                        data_quality_json,
                        market_md,
                        news_social_md,
                        fundamentals_md,
                    )
                    + f"\n\nPrior debate to refine:\n{chr(10).join(debate_history)}",
                    DebateArgument(
                        stance="bull",
                        thesis=f"Deep mode could not generate an additional bullish refinement for {ticker}.",
                        evidence=[
                            "Prior analyst reports remain available.",
                            "The prior debate remains available for review.",
                        ],
                        counterargument="No extra bullish refinement was generated.",
                        risk_flags=["Deep debate fallback used."],
                        confidence=0.35,
                        consensus_signal=False,
                    ),
                    f"Bull Researcher R{round_number}",
                    llm_budget,
                    cancel_check,
                ),
                timings=pipeline_timings,
            )
            debate_history.append(render_debate_argument(bull, f"Bull Researcher R{round_number}"))

            bear = _run_tracked(
                progress_callback,
                "bear_researcher",
                f"Deep mode bear review round {round_number} is challenging the refined thesis...",
                lambda bull=bull, round_number=round_number: _invoke_once(
                    quick_llm,
                    DebateArgument,
                    bear_prompt(
                        ticker,
                        trade_date,
                        time_horizon_text,
                        data_quality_json,
                        market_md,
                        news_social_md,
                        fundamentals_md,
                        bull,
                    )
                    + f"\n\nPrior debate to refine:\n{chr(10).join(debate_history)}",
                    DebateArgument(
                        stance="bear",
                        thesis=f"Deep mode could not generate an additional bearish refinement for {ticker}.",
                        evidence=[
                            "Prior analyst reports remain available.",
                            "The prior debate remains available for review.",
                        ],
                        counterargument="No extra bearish refinement was generated.",
                        risk_flags=["Deep debate fallback used."],
                        confidence=0.35,
                        consensus_signal=False,
                    ),
                    f"Bear Researcher R{round_number}",
                    llm_budget,
                    cancel_check,
                ),
                timings=pipeline_timings,
            )
            debate_history.append(render_debate_argument(bear, f"Bear Researcher R{round_number}"))

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
                rationale="The evidence is incomplete or the research manager call failed, so the safest recommendation is Hold until the analysis is verified.",
                strategic_actions="Avoid new exposure until data quality, model output, and key risk/reward assumptions are reviewed.",
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
            trader_prompt(ticker, trade_date, time_horizon_text, market_md, investment_plan, data_quality_json),
            TraderProposal(
                confidence=0.35,
                action=TraderAction.HOLD,
                reasoning="The balanced pipeline could not generate a reliable trader proposal, so no new trade should be opened.",
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

    if analysis_depth == "fast":
        _emit_progress(
            progress_callback,
            "risk_analysts",
            "completed",
            "Risk committee skipped in fast mode; conservative risk fallback applied.",
        )
        _record_skipped_timing(
            pipeline_timings,
            "risk_analysts",
            "Risk Analysts",
            "Skipped in fast mode; conservative risk fallback applied.",
        )
        risk_report = RiskCommitteeReport(
            overall_risk_level="Medium" if data.data_quality.price_data == "ok" else "High",
            aggressive_view="Fast mode skips a separate aggressive risk debate to save LLM calls.",
            neutral_view="Use the trader proposal with conservative sizing and verify manually before increasing exposure.",
            conservative_view="Prefer Hold or small allocation until balanced/deep analysis confirms the setup.",
            key_risks=list(
                dict.fromkeys(
                    (data.data_quality.warnings or [])
                    + market_report.risks
                    + news_social_report.risks
                    + fundamentals_report.risks
                )
            )[:8],
            mitigation_plan="Keep sizing small, require a clear stop-loss, and rerun balanced/deep mode before a high-conviction trade.",
            confidence=0.45,
        )
    else:
        risk_report = _run_tracked(
            progress_callback,
            "risk_analysts",
            "Risk Analysts are checking sizing, downside, and invalidation triggers...",
            lambda: _invoke_once(
                quick_llm,
                RiskCommitteeReport,
                risk_committee_prompt(
                    ticker,
                    trade_date,
                    time_horizon_text,
                    market_md,
                    news_social_md,
                    fundamentals_md,
                    debate_md,
                    investment_plan,
                    trader_plan,
                    data_quality_json,
                ),
                RiskCommitteeReport(
                    overall_risk_level="High",
                    aggressive_view="The opportunity cannot be assessed aggressively because the risk model call failed.",
                    neutral_view="Hold is preferred until the analysis is verified.",
                    conservative_view="Avoid new exposure until reliable downside controls are available.",
                    key_risks=[
                        "Risk committee model output fallback used.",
                        "Data and model output should be reviewed before trading.",
                    ],
                    mitigation_plan="Use no new allocation or a very small test position only after manual review.",
                    confidence=0.35,
                ),
                "Risk Committee",
                llm_budget,
                cancel_check,
            ),
            timings=pipeline_timings,
        )
        for round_number in range(2, extra_risk_rounds + 2):
            prior_risk_md = _risk_to_markdown(risk_report)
            risk_report = _run_tracked(
                progress_callback,
                "risk_analysts",
                f"Deep mode risk review round {round_number} is stress-testing the trade plan...",
                lambda prior_risk_md=prior_risk_md, round_number=round_number: _invoke_once(
                    quick_llm,
                    RiskCommitteeReport,
                    risk_committee_prompt(
                        ticker,
                        trade_date,
                        time_horizon_text,
                        market_md,
                        news_social_md,
                        fundamentals_md,
                        debate_md + f"\n\nPrior risk review:\n{prior_risk_md}",
                        investment_plan,
                        trader_plan,
                        data_quality_json,
                    ),
                    RiskCommitteeReport(
                        overall_risk_level="High",
                        aggressive_view="Deep mode could not generate an extra aggressive risk review.",
                        neutral_view="Use the previous risk committee output until this deep review is verified.",
                        conservative_view="Avoid increasing exposure when the deep risk review falls back.",
                        key_risks=["Deep risk review fallback used."],
                        mitigation_plan="Keep the previous risk controls and manually verify sizing.",
                        confidence=0.35,
                    ),
                    f"Risk Committee R{round_number}",
                    llm_budget,
                    cancel_check,
                ),
                timings=pipeline_timings,
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
        current_price_source=data.last_close_price_source if data.last_close_price is not None else None,
        has_existing_position=bool(has_existing_position),
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
        price_data=data.price_data,
        data_quality=data.data_quality.model_dump(),
    )
    safety_context = getattr(data, "safety_prompt_context", None)
    if safety_context is not None:
        guarded_action, guardrail_warnings = apply_guardrail(safety_context, _decision_action(portfolio_decision))
        if guardrail_warnings:
            _append_guardrail_warnings(data, portfolio_decision, guardrail_warnings)
        if guarded_action == "WAIT" and _decision_action(portfolio_decision) in {"BUY", "SELL"}:
            _downgrade_decision_to_wait(portfolio_decision, guardrail_warnings, has_existing_position)

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
    decision.validation_warnings = list(dict.fromkeys([*(decision.validation_warnings or []), *warnings]))[:20]


def _downgrade_decision_to_wait(
    decision: PortfolioDecision,
    warnings: list[str],
    has_existing_position: bool,
) -> None:
    reason = next((warning for warning in warnings if "Action downgraded" in warning), warnings[0] if warnings else None)
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
    decision.rebalancing_action = "Maintain position" if has_existing_position else "No position to rebalance"
    decision.new_entry_action = "Wait for valid entry setup"
    decision.position_size_hint = (
        "Maintain current position size; no additional exposure suggested."
        if has_existing_position
        else "0% allocation until setup improves."
    )


def persist_metrics(context: PipelineContext) -> PipelineMetrics:
    llm_budget = context.llm_budget
    pipeline_started_at = context.pipeline_started_at
    budget_snapshot = llm_budget.snapshot()
    total_pipeline_seconds = round(time.perf_counter() - pipeline_started_at, 1)

    return PipelineMetrics(
        budget_snapshot=budget_snapshot,
        total_pipeline_seconds=total_pipeline_seconds,
    )


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
    budget_partial = "Portfolio Manager" in set(budget_snapshot.get("agents_skipped", []))
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
                "news": bool((data.news_context or {}).get("top_articles") or (data.news_context or {}).get("articles")),
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
        "last_close_price_source": data.last_close_price_source if data.last_close_price is not None else None,
        "price_source": data.last_close_price_source if data.last_close_price is not None else None,
        "price_timestamp": data.last_close_price_as_of if data.last_close_price is not None else None,
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
    run_cache = RunCache(str(config.get("job_id") or config.get("request_id") or f"{ticker}:{trade_date}:{time.perf_counter_ns()}"))
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
        data_stage = collect_market_data(context)
        agent_stage = run_agents(context, data_stage)
        portfolio_decision = aggregate_decision(context, data_stage, agent_stage)
        metrics = persist_metrics(context)
        return build_response(context, data_stage, agent_stage, portfolio_decision, metrics)
    finally:
        run_cache.clear()
