from __future__ import annotations

import json
import logging
import queue
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from tradingagents.agents.schemas import (
    DebateArgument,
    PortfolioDecision,
    PortfolioRating,
    TechnicalLevels,
    TraderAction,
    TraderProposal,
    VolatilityLevel,
    render_debate_argument,
    render_trader_proposal,
)
from tradingagents.dataflows.config import set_config
from tradingagents.pipeline_balanced_data import (
    _normalize_time_horizon_months,
    _run_with_config,
    _time_horizon_label,
    collect_market_data,
)
from tradingagents.pipeline_balanced_llm import (
    _create_llms,
    _fallback_report,
    _invoke_once,
    _report_to_markdown,
    _research_plan_to_markdown,
    _risk_to_markdown,
)
from tradingagents.pipeline_balanced_progress import AGENT_LABELS, _emit_data_quality, _emit_progress, _run_tracked
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

AGENT_PIPELINE_ORDER = [
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


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _set_agent_timing(
    timings: dict[str, dict[str, Any]],
    agent_id: str,
    *,
    status: str | None = None,
    warning: str | None = None,
) -> None:
    item = timings.setdefault(
        agent_id,
        {
            "name": AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
            "status": "ok",
            "duration_seconds": 0.0,
            "warning": None,
        },
    )
    if status:
        item["status"] = status
    if warning:
        item["warning"] = warning


def _mark_data_quality_timings(timings: dict[str, dict[str, Any]], data) -> None:
    report = getattr(data, "data_quality", None)
    if report is None:
        return
    first_warning = (report.warnings or [None])[0]

    if report.price_data in {"missing", "invalid_ticker"}:
        _set_agent_timing(timings, "data_collection", status="error", warning=first_warning or "Price data unavailable.")
    elif report.price_data in {"partial", "market_closed"}:
        _set_agent_timing(timings, "data_collection", status="fallback", warning=first_warning or "Price data used a fallback path.")

    if report.fundamentals in {"partial", "missing", "unavailable"}:
        _set_agent_timing(
            timings,
            "fundamentals",
            status="partial" if report.fundamentals != "missing" else "error",
            warning=first_warning or "Some fundamental statement data was not available from the provider.",
        )
    if report.news in {"partial", "missing", "unavailable"}:
        _set_agent_timing(
            timings,
            "news_analyst",
            status="partial" if report.news == "partial" else "fallback",
            warning=first_warning or "News coverage was incomplete or unavailable.",
        )


def _agent_pipeline_from_timings(timings: dict[str, dict[str, Any]]) -> tuple[list[dict[str, Any]], float]:
    rows: list[dict[str, Any]] = []
    for agent_id in AGENT_PIPELINE_ORDER:
        item = timings.get(agent_id)
        if not item:
            item = {
                "name": AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
                "status": "fallback",
                "duration_seconds": 0.0,
                "warning": "This stage was skipped or did not report timing metadata.",
            }
        rows.append(
            {
                "name": item.get("name") or AGENT_LABELS.get(agent_id, agent_id.replace("_", " ").title()),
                "status": item.get("status") or "ok",
                "duration_seconds": round(float(item.get("duration_seconds") or 0.0), 1),
                "warning": item.get("warning"),
            }
        )
    return rows, round(sum(row["duration_seconds"] for row in rows), 1)


def _build_technical_levels(decision: PortfolioDecision, technical_entry: dict[str, Any] | None) -> TechnicalLevels:
    technical = technical_entry if isinstance(technical_entry, dict) else {}
    current_price = _safe_float(getattr(decision, "current_price", None))
    if current_price is None:
        return TechnicalLevels(current_price=0.0, technical_levels_available=False)

    trade_plan_valid = bool(getattr(decision, "trade_plan_valid", False))
    entry_price = _safe_float(getattr(decision, "entry_price", None)) if trade_plan_valid else None
    stop_loss = _safe_float(getattr(decision, "stop_loss", None)) if trade_plan_valid else None
    risk_reward = getattr(decision, "risk_reward_display", None) or getattr(decision, "risk_reward_ratio", None)
    if not trade_plan_valid:
        risk_reward = "Not attractive"
    elif isinstance(risk_reward, (int, float)):
        risk_reward = f"1:{risk_reward:g}"

    return TechnicalLevels(
        current_price=current_price,
        nearest_support=_safe_float(technical.get("support")),
        nearest_resistance=_safe_float(technical.get("resistance")),
        suggested_stop_loss=stop_loss,
        invalidation_level=stop_loss or _safe_float(technical.get("support")),
        entry_range_low=entry_price,
        entry_range_high=entry_price,
        risk_reward_ratio=str(risk_reward) if risk_reward is not None else None,
        technical_levels_available=bool(technical.get("available", True)),
    )


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
    agent_timings: dict[str, dict[str, Any]] | None = None,
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
            timings=agent_timings,
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
            timings=agent_timings,
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
            timings=agent_timings,
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
    """Run the balanced 9-call pipeline and return classic-compatible state."""
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
    llm_budget = LLMBudget(int(config.get("max_gemini_calls", 9)))
    agent_timings: dict[str, dict[str, Any]] = {}
    _emit_progress(
        progress_callback, "news_fetch", "started", "Fetching normalized company news from configured providers..."
    )
    data = _run_tracked(
        progress_callback,
        "data_collection",
        "Collecting yfinance prices, indicators, fundamentals, news, and insider data...",
        lambda: collect_market_data(ticker, trade_date, config, cancel_check=cancel_check),
        cancel_check=cancel_check,
        timings=agent_timings,
    )
    _mark_data_quality_timings(agent_timings, data)
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
        agent_timings,
    )
    _mark_data_quality_timings(agent_timings, data)

    market_md = _report_to_markdown(market_report)
    news_social_md = _report_to_markdown(news_social_report)
    fundamentals_md = _report_to_markdown(fundamentals_report)

    debate_history: list[str] = []

    if analysis_depth == "fast":
        _emit_progress(progress_callback, "bull_researcher", "completed", "Bull debate skipped in fast mode.")
        _emit_progress(progress_callback, "bear_researcher", "completed", "Bear debate skipped in fast mode.")
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
        _set_agent_timing(
            agent_timings,
            "bull_researcher",
            status="fallback",
            warning="Bull debate skipped in fast mode.",
        )
        _set_agent_timing(
            agent_timings,
            "bear_researcher",
            status="fallback",
            warning="Bear debate skipped in fast mode.",
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
            timings=agent_timings,
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
            timings=agent_timings,
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
                timings=agent_timings,
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
                timings=agent_timings,
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
        timings=agent_timings,
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
        timings=agent_timings,
    )
    trader_plan = render_trader_proposal(trader_proposal)

    if analysis_depth == "fast":
        _emit_progress(
            progress_callback,
            "risk_analysts",
            "completed",
            "Risk committee skipped in fast mode; conservative risk fallback applied.",
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
        _set_agent_timing(
            agent_timings,
            "risk_analysts",
            status="fallback",
            warning="Risk committee skipped in fast mode; conservative risk fallback applied.",
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
            timings=agent_timings,
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
                timings=agent_timings,
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
            PortfolioDecision(
                confidence_score=0.35,
                rating=PortfolioRating.HOLD,
                executive_summary=(
                    f"The final rating for {ticker} is Hold because the pipeline reached the portfolio stage through a safety fallback, so the most responsible recommendation is to preserve capital rather than force a trade from incomplete evidence. The single most important reason is output reliability: the backend could not treat the final model response as a complete investment decision. "
                    "Recent price action should be treated as context only, not as confirmation, because the final structured model response could not be verified. Any move in the share price may reflect normal market noise, provider gaps, or speculative positioning, and it should not be classified as fundamentally supported until a clean rerun connects the move to fresh earnings, news, or technical evidence. "
                    "The fundamental picture is also incomplete in this fallback path. Revenue trend, profitability, cash flow quality, and balance sheet strength may have been collected earlier, but the final decision layer did not validate them into a reliable investment conclusion or translate them into a clean position plan. "
                    "The risk level is High because missing or partial final output can hide stale prices, unsupported trade levels, weak risk/reward, and incomplete fundamental data. The two main risks are acting on an unverified model response and using fallback vendor data as if it were complete market evidence. "
                    f"The action right now is to avoid any new entry, keep allocation at zero for fresh trades, and rerun the analysis until the dashboard shows clean data quality and validated trade levels. Existing holders should maintain only if their separate risk plan already allows it for the selected {time_horizon_text} horizon."
                ),
                investment_thesis=(
                    f"{ticker} should be treated as a Hold until the analysis can be regenerated cleanly because this output came from a portfolio fallback rather than a fully verified model decision. The business may still have analyzable operations, segments, and industry positioning, but this fallback does not safely confirm those details. For dashboard purposes, the company profile and segment view should be read in the dedicated profile and fundamental tabs, not inferred from this safety message. "
                    "Recent price movement is not enough to justify a new trade here. The pipeline may have collected market data, technical indicators, and news context, yet the final decision layer failed to convert those inputs into a dependable call. That means any recent price strength or weakness should be treated as unconfirmed until a rerun identifies whether it came from earnings, valuation change, institutional flows, sector rotation, or simple speculation. Without that link, chasing the move would be theatrical portfolio management, which is just gambling with nicer fonts. "
                    "The fundamental view is therefore incomplete. Revenue growth, profit margins, cash flow quality, and balance sheet strength might exist in the collected data, but the final structured response did not validate them with enough reliability to support Buy or Sell. A sound thesis needs specific numbers, period labels, and provider quality checks before it can say whether profitability is improving, leverage is safe, or cash generation supports the valuation. When those checks are uncertain, the correct conclusion is caution. "
                    "The technical view is also defensive. Current price can be displayed if the backend has a valid quote, but entry, support, resistance, stop loss, and take profit should not be invented. A valid setup needs a clear level, a protective stop, and a reward target that passes the backend risk/reward rules. If that structure is absent, the correct trade is no trade, because pretending otherwise simply converts missing evidence into decorative confidence. "
                    "The main risks are macro volatility, sector-level sentiment shifts, and company-specific uncertainty caused by incomplete final validation. These risks matter because weak data can make a bad setup look clean. The recommendation would improve only after a clean rerun shows complete provider data, a validated technical setup, and consistent analyst, trader, and risk committee evidence. It would downgrade further if price data remains missing, fundamentals stay partial, or risk controls fail validation. Until those conditions change, open no new position, do not average down, and use the next clean analysis as the trigger for any upgrade."
                ),
                suggested_allocation_percent=0.0,
                entry_price=None,
                stop_loss=None,
                take_profit=None,
                risk_reward_ratio=None,
                max_drawdown_estimate="Not estimated because final output used fallback.",
                volatility_level=VolatilityLevel.HIGH,
                position_sizing_reason="Fallback output and/or incomplete data quality require zero new allocation.",
                rebalancing_action="Maintain position",
                key_catalysts=[],
                invalidation_conditions=["Clean data and clean model output are not available."],
                price_target=None,
                time_horizon=time_horizon_text,
                current_price=data.last_close_price,
                current_price_as_of=data.price_timestamp or data.last_close_price_as_of or trade_date,
                current_price_source=(data.price_source or data.last_close_price_source) if data.last_close_price is not None else None,
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
                validation_warnings=[],
            ),
            "Portfolio Manager",
            llm_budget,
            cancel_check,
        ),
        timings=agent_timings,
    )

    portfolio_decision = normalize_trade_levels(
        portfolio_decision,
        current_price=data.last_close_price,
        ticker=ticker,
        current_price_as_of=data.price_timestamp or data.last_close_price_as_of or trade_date,
        current_price_source=(data.price_source or data.last_close_price_source) if data.last_close_price is not None else None,
        has_existing_position=bool(has_existing_position),
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
        price_data=data.price_data,
        data_quality=data.data_quality.model_dump(),
    )

    technical_levels = _build_technical_levels(portfolio_decision, data.technical_entry)
    agent_pipeline, total_pipeline_seconds = _agent_pipeline_from_timings(agent_timings)
    budget_snapshot = llm_budget.snapshot()

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
        "technical_levels": technical_levels.model_dump(),
        "agent_pipeline": agent_pipeline,
        "total_pipeline_seconds": total_pipeline_seconds,
        "data_quality": data.data_quality.model_dump(),
        "data_sources": data.data_sources or {},
        "data_freshness": data.data_freshness or {},
        "data_limitations": data.data_limitations or [],
        "vendor_attempts": data.vendor_attempts or {},
        "request_budget": data.request_budget or {},
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
        "last_close_price_as_of": data.last_close_price_as_of or trade_date,
        "last_price": data.last_close_price,
        "price_currency": data.price_currency,
        "price_source": data.price_source or data.last_close_price_source,
        "price_timestamp": data.price_timestamp or data.last_close_price_as_of or trade_date,
        "price_is_fallback": data.price_is_fallback,
        "volatility_metadata": data.volatility_metadata or {},
        "analysis_depth": analysis_depth,
        "analysis_depth_config": depth_config,
        "analysis_depth_debate_rounds": depth_debate_rounds,
        "analysis_depth_risk_rounds": depth_risk_rounds,
        "balanced_gemini_request_budget": llm_budget.limit,
        "balanced_gemini_calls_used": budget_snapshot["used"],
        "budget_exhausted": budget_snapshot["budget_exhausted"],
        "agents_skipped": budget_snapshot["agents_skipped"],
    }
