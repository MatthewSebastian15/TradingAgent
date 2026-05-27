from __future__ import annotations

import json
import logging
import queue
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
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
    time_horizon_months = _normalize_time_horizon_months(config.get("time_horizon_months", 1))
    time_horizon_text = _time_horizon_label(time_horizon_months)
    llm_budget = LLMBudget(int(config.get("max_gemini_calls", 9)))
    data = _run_tracked(
        progress_callback,
        "data_collection",
        "Collecting yfinance prices, indicators, fundamentals, news, and insider data...",
        lambda: collect_market_data(ticker, trade_date, config, cancel_check=cancel_check),
        cancel_check=cancel_check,
    )
    data_fetched_at = datetime.utcnow().isoformat()
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
    )

    market_md = _report_to_markdown(market_report)
    news_social_md = _report_to_markdown(news_social_report)
    fundamentals_md = _report_to_markdown(fundamentals_report)

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
            risk_flags=list(dict.fromkeys(market_report.risks + news_social_report.risks + fundamentals_report.risks))[
                :6
            ],
            confidence=0.45,
            consensus_signal=False,
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
        )

    debate_md = "\n\n".join(
        [
            render_debate_argument(bull, "Bull Researcher"),
            render_debate_argument(bear, "Bear Researcher"),
        ]
    )

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
                rebalancing_action="Hold existing exposure and avoid adding until reviewed.",
                key_catalysts=[],
                invalidation_conditions=["Data quality or model output cannot be verified."],
            ),
            "Trader",
            llm_budget,
            cancel_check,
        ),
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
                    f"The final rating for {ticker} is Hold because the balanced pipeline could not generate a fully reliable final model decision. "
                    "The available market, news, and fundamental data were collected, but the final structured output needs manual review. "
                    "The biggest risk is acting on incomplete or fallback analysis, and that risk overrides any aggressive trade idea. "
                    "The recommended action is to avoid new exposure, keep position size at zero for new trades, and wait for a verified analysis before setting a stop-loss. "
                    f"The selected analysis horizon is {time_horizon_text}, but this fallback result requires review before trading."
                ),
                investment_thesis=(
                    f"{ticker} should stay on hold until the analysis can be verified. "
                    "The system collected price, technical, news, and fundamental data, but the final model output used a fallback. "
                    "That means the dashboard can still display a safe result, but it should not be treated as a high-confidence investment call. "
                    "The bull case and bear case require confirmation from a clean model response. "
                    "The safest action is to avoid adding exposure. "
                    "A new decision should be generated once the model and data calls complete normally."
                ),
                suggested_allocation_percent=0.0,
                entry_price=None,
                stop_loss=None,
                take_profit=None,
                risk_reward_ratio=None,
                max_drawdown_estimate="Not estimated because final output used fallback.",
                volatility_level=VolatilityLevel.HIGH,
                position_sizing_reason="Fallback output and/or incomplete data quality require zero new allocation.",
                rebalancing_action="Hold or move to watchlist until verified.",
                key_catalysts=[],
                invalidation_conditions=["Clean data and clean model output are not available."],
                price_target=None,
                time_horizon=time_horizon_text,
                current_price=data.last_close_price,
                current_price_as_of=data.last_close_price_as_of or trade_date,
                current_price_source="yfinance:last_close" if data.last_close_price is not None else None,
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
    )

    portfolio_decision = normalize_trade_levels(
        portfolio_decision,
        current_price=data.last_close_price,
        ticker=ticker,
        current_price_as_of=data.last_close_price_as_of or trade_date,
        current_price_source="yfinance:last_close" if data.last_close_price is not None else None,
        has_existing_position=bool(has_existing_position),
        position_quantity=position_quantity,
        average_entry_price=average_entry_price,
        price_data=data.price_data,
        data_quality=data.data_quality.model_dump(),
    )

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
            "count": 2,
        },
        "investment_plan": investment_plan,
        "trader_investment_plan": trader_plan,
        "risk_debate_state": {
            "aggressive_history": risk_report.aggressive_view,
            "neutral_history": risk_report.neutral_view,
            "conservative_history": risk_report.conservative_view,
            "history": risk_md,
            "judge_decision": risk_md,
            "count": 3,
        },
        "portfolio_decision": portfolio_decision,
        "data_quality": data.data_quality.model_dump(),
        "data_fetched_at": data_fetched_at,
        "last_close_price": data.last_close_price,
        "last_close_price_as_of": data.last_close_price_as_of or trade_date,
        "analysis_depth": analysis_depth,
        "balanced_gemini_request_budget": llm_budget.limit,
        "balanced_gemini_calls_used": budget_snapshot["used"],
        "budget_exhausted": budget_snapshot["budget_exhausted"],
        "agents_skipped": budget_snapshot["agents_skipped"],
    }
