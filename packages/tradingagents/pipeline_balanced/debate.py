"""Debate and risk-committee phases of the balanced pipeline.

Late-bound facade symbols (patchable in tests) are resolved through the
orchestrator module at call time: use _orch._invoke_once, never a direct import.
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, TypeVar

from tradingagents.agents.schemas import DebateArgument, render_debate_argument
from tradingagents.pipeline_balanced import orchestrator as _orch
from tradingagents.pipeline_balanced.fallbacks import _limit_unique_text_items
from tradingagents.pipeline_balanced.progress import _emit_progress, _run_tracked
from tradingagents.pipeline_balanced.prompts import (
    bear_prompt,
    bull_prompt,
    risk_committee_prompt,
)
from tradingagents.pipeline_balanced.types import (
    AnalystReport,
    CollectedData,
    RiskCommitteeReport,
)

if TYPE_CHECKING:
    from tradingagents.pipeline_balanced.orchestrator import PipelineContext

T = TypeVar("T")
U = TypeVar("U")


def _locked_callback(callback):
    if callback is None:
        return None
    lock = threading.Lock()

    def locked(event):
        with lock:
            callback(event)

    return locked


def _run_pair(config: dict, first: Callable[[], T], second: Callable[[], U]) -> tuple[T, U]:
    with ThreadPoolExecutor(max_workers=2, thread_name_prefix="balanced-debate") as pool:
        first_future = pool.submit(_orch._run_with_config, config, first)
        second_future = pool.submit(_orch._run_with_config, config, second)
        return first_future.result(), second_future.result()


def _run_debate_phase(
    context: PipelineContext,
    *,
    market_report: AnalystReport,
    news_social_report: AnalystReport,
    fundamentals_report: AnalystReport,
    market_md: str,
    news_social_md: str,
    fundamentals_md: str,
    data_quality_json: str,
) -> tuple[DebateArgument, DebateArgument, list[str]]:
    """Bull/bear debate phase (synthetic in fast mode, LLM-driven otherwise)."""
    ticker = context.ticker
    trade_date = context.trade_date
    bull_llm = context.llm_for("bull_researcher")
    bear_llm = context.llm_for("bear_researcher")
    analysis_depth = context.analysis_depth
    extra_debate_rounds = context.extra_debate_rounds
    time_horizon_text = context.time_horizon_text
    llm_budget = context.llm_budget
    pipeline_timings = context.pipeline_timings
    progress_callback = context.progress_callback
    cancel_check = context.cancel_check

    debate_history: list[str] = []

    if analysis_depth == "fast":
        _emit_progress(
            progress_callback, "bull_researcher", "completed", "Bull debate skipped in fast mode."
        )
        _emit_progress(
            progress_callback, "bear_researcher", "completed", "Bear debate skipped in fast mode."
        )
        _orch._record_skipped_timing(
            pipeline_timings,
            "bull_researcher",
            "Bull Researcher",
            "Skipped in fast mode to reduce LLM calls.",
        )
        _orch._record_skipped_timing(
            pipeline_timings,
            "bear_researcher",
            "Bear Researcher",
            "Skipped in fast mode to reduce LLM calls.",
        )
        bull = DebateArgument(
            stance="bull",
            thesis=(
                f"Fast mode uses the analyst reports directly for {ticker} instead of a separate "
                "bull debate."
            ),
            evidence=[
                "Market report completed.",
                "News/social report completed.",
                "Fundamentals report completed.",
            ],
            counterargument="Fast mode has less debate depth than balanced/deep mode.",
            risk_flags=["Debate skipped to reduce LLM calls."],
            confidence=max(
                0.25,
                min(
                    0.75,
                    (
                        market_report.confidence
                        + news_social_report.confidence
                        + fundamentals_report.confidence
                    )
                    / 3,
                ),
            ),
            consensus_signal=False,
        )
        bear = DebateArgument(
            stance="bear",
            thesis=(
                f"Fast mode keeps downside assumptions conservative for {ticker} because no "
                "separate bear debate was run."
            ),
            evidence=[
                "Risk is inferred from analyst report risk sections.",
                "Data quality warnings are preserved.",
            ],
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
        callback = _locked_callback(progress_callback)

        def bull_fallback(label: str) -> DebateArgument:
            return DebateArgument(
                stance="bull",
                thesis=(
                    f"The bullish case for {ticker} is not strong enough to rate confidently "
                    "because model output failed."
                ),
                evidence=[
                    "Market, news, and fundamental reports were collected.",
                    f"A complete bullish argument was not generated ({label}).",
                ],
                counterargument=(
                    "The absence of a reliable bullish argument weakens any aggressive buy "
                    + "decision."
                ),
                risk_flags=["Model output fallback used."],
                confidence=0.0,
                consensus_signal=False,
            )

        def bear_fallback(label: str) -> DebateArgument:
            return DebateArgument(
                stance="bear",
                thesis=(
                    f"The bearish case for {ticker} is incomplete because model output "
                    "failed, so risk should be treated cautiously."
                ),
                evidence=[
                    "Market, news, and fundamental reports were collected.",
                    f"A complete bearish argument was not generated ({label}).",
                ],
                counterargument=(
                    "Without a reliable bear case, the final decision should avoid "
                    + "overconfidence."
                ),
                risk_flags=["Model output fallback used."],
                confidence=0.0,
                consensus_signal=False,
            )

        def bull_call(label: str, suffix: str) -> DebateArgument:
            return _run_tracked(
                callback,
                "bull_researcher",
                f"{label} is building the upside case...",
                lambda: _orch._invoke_once(
                    bull_llm,
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
                    + suffix,
                    bull_fallback(label),
                    label,
                    llm_budget,
                    cancel_check,
                ),
                timings=pipeline_timings,
            )

        def bear_call(label: str, suffix: str, bull_case: DebateArgument | None) -> DebateArgument:
            return _run_tracked(
                callback,
                "bear_researcher",
                f"{label} is challenging the thesis...",
                lambda: _orch._invoke_once(
                    bear_llm,
                    DebateArgument,
                    bear_prompt(
                        ticker,
                        trade_date,
                        time_horizon_text,
                        data_quality_json,
                        market_md,
                        news_social_md,
                        fundamentals_md,
                        bull_case,
                    )
                    + suffix,
                    bear_fallback(label),
                    label,
                    llm_budget,
                    cancel_check,
                ),
                timings=pipeline_timings,
            )

        bull, bear = _run_pair(
            context.config,
            lambda: bull_call("Bull Researcher", ""),
            lambda: bear_call("Bear Researcher", "", None),
        )
        debate_history.extend(
            [
                render_debate_argument(bull, "Bull Researcher"),
                render_debate_argument(bear, "Bear Researcher"),
            ]
        )

        for round_number in range(2, extra_debate_rounds + 2):
            suffix = f"\n\nPrior debate to refine:\n{chr(10).join(debate_history)}"
            previous_bull = bull
            bull, bear = _run_pair(
                context.config,
                lambda n=round_number, s=suffix: bull_call(f"Bull Researcher R{n}", s),
                lambda n=round_number, s=suffix, b=previous_bull: bear_call(
                    f"Bear Researcher R{n}", s, b
                ),
            )
            debate_history.extend(
                [
                    render_debate_argument(bull, f"Bull Researcher R{round_number}"),
                    render_debate_argument(bear, f"Bear Researcher R{round_number}"),
                ]
            )

    return bull, bear, debate_history


def _run_risk_phase(
    context: PipelineContext,
    *,
    data: CollectedData,
    market_report: AnalystReport,
    news_social_report: AnalystReport,
    fundamentals_report: AnalystReport,
    market_md: str,
    news_social_md: str,
    fundamentals_md: str,
    debate_md: str,
    investment_plan: str,
    trader_plan: str,
    data_quality_json: str,
) -> RiskCommitteeReport:
    """Risk committee phase (synthetic in fast mode, LLM-driven otherwise)."""
    ticker = context.ticker
    trade_date = context.trade_date
    risk_llm = context.llm_for("risk_analysts")
    analysis_depth = context.analysis_depth
    time_horizon_text = context.time_horizon_text
    llm_budget = context.llm_budget
    pipeline_timings = context.pipeline_timings
    progress_callback = context.progress_callback
    cancel_check = context.cancel_check

    if analysis_depth == "fast":
        _emit_progress(
            progress_callback,
            "risk_analysts",
            "completed",
            "Risk committee skipped in fast mode; conservative risk fallback applied.",
        )
        _orch._record_skipped_timing(
            pipeline_timings,
            "risk_analysts",
            "Risk Analysts",
            "Skipped in fast mode; conservative risk fallback applied.",
        )
        risk_report = RiskCommitteeReport(
            overall_risk_level="Medium" if data.data_quality.price_data == "ok" else "High",
            aggressive_view="Fast mode skips a separate aggressive risk debate to save LLM calls.",
            neutral_view=(
                "Use the trader proposal with conservative sizing and verify manually before "
                + "increasing exposure."
            ),
            conservative_view=(
                "Prefer Hold or small allocation until balanced/deep analysis confirms the setup."
            ),
            key_risks=list(
                dict.fromkeys(
                    (data.data_quality.warnings or [])
                    + market_report.risks
                    + news_social_report.risks
                    + fundamentals_report.risks
                )
            )[:8],
            mitigation_plan=(
                "Keep sizing small, require a clear stop-loss, and rerun balanced/deep mode "
                + "before a high-conviction trade."
            ),
            confidence=0.45,
        )
    else:
        risk_report = _run_tracked(
            progress_callback,
            "risk_analysts",
            "Risk Analysts are checking sizing, downside, and invalidation triggers...",
            lambda: _orch._invoke_once(
                risk_llm,
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
                    aggressive_view=(
                        "The opportunity cannot be assessed aggressively because the risk model "
                        + "call failed."
                    ),
                    neutral_view="Hold is preferred until the analysis is verified.",
                    conservative_view=(
                        "Avoid new exposure until reliable downside controls are available."
                    ),
                    key_risks=[
                        "Risk committee model output fallback used.",
                        "Data and model output should be reviewed before trading.",
                    ],
                    mitigation_plan=(
                        "Use no new allocation or a very small test position only after manual "
                        + "review."
                    ),
                    confidence=0.0,
                ),
                "Risk Committee",
                llm_budget,
                cancel_check,
            ),
            timings=pipeline_timings,
        )
    return risk_report
