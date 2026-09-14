"""Deterministic fallback texts for the balanced pipeline (no LLM calls)."""

from __future__ import annotations

from typing import Any

from tradingagents.agents.schemas import (
    PortfolioDecision,
    PortfolioRating,
    VolatilityLevel,
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


def _fallback_portfolio_executive_summary(ticker: str, time_horizon_text: str) -> str:
    """Return a schema-valid fallback executive summary.

    PortfolioDecision enforces a 250-300 word range. Keep this fallback inside
    that range so a failed or malformed LLM response never crashes the job while
    constructing the local safety decision.
    """
    return (
        f"The final rating for {ticker} is Hold because the pipeline could not produce a fully "
        "validated portfolio decision, and protecting capital is safer than forcing a trade from "
        "incomplete evidence. "
        + (
            "The most important reason is process reliability: a recommendation is only useful "
            + "when price, fundamentals, risk controls, and final model output all pass validation "
            + "together.\n"
            + "\n"
        )
        + (
            "Recent price action should therefore be treated as context, not as permission to "
            + "enter. The system may have collected market and news inputs, but a failed final "
            + "decision layer can hide stale prices, missing provider responses, or unsupported "
            + "trade levels. "
        )
        + (
            "Any movement that appears attractive must be separated from a verified fundamental "
            + "driver.\n"
            + "\n"
        )
        + (
            "Fundamental interpretation also needs caution. Revenue trend, profitability, cash "
            + "flow, and balance sheet quality may have partial signals, yet the fallback path "
            + "means those signals were not converted into a clean dashboard-ready decision. "
        )
        + (
            "Financial health should be reviewed again after provider calls and structured "
            + "output complete normally.\n"
            + "\n"
        )
        + (
            "The overall risk level is High because data quality and model completeness are both "
            + "uncertain. The top risks are acting on partial vendor data and relying on a "
            + "shortened or malformed final thesis. "
        )
        + (
            "Either risk can make allocation, stop-loss, take-profit, and risk/reward fields "
            + "misleading.\n"
            + "\n"
        )
        + (
            f"The immediate action is to avoid new exposure for the selected {time_horizon_text} "
            "horizon, keep allocation at zero for new trades, and rerun the analysis after the "
            "backend returns a clean structured result. "
        )
        + (
            "Existing holders should maintain or reduce risk only through their own verified "
            + "plan, not this fallback message."
        )
    )


def _fallback_portfolio_investment_thesis(ticker: str, time_horizon_text: str) -> str:
    """Return a schema-valid fallback investment thesis.

    PortfolioDecision enforces a 400-450 word range. This deterministic thesis
    keeps the pipeline alive when the Portfolio Manager model returns short,
    invalid, or unparseable content.
    """
    return (
        f"{ticker} should stay on Hold until the analysis can be verified because the fallback "
        "path is a process signal, not a market conviction signal. "
        + (
            "The company may have a valid business, liquid trading, and useful public "
            + "disclosures, but the final portfolio layer did not produce a clean structured "
            + "answer. "
        )
        + (
            "A dashboard recommendation must connect business context, price behavior, "
            + "fundamentals, technical levels, risk controls, and data quality. When that chain "
            + "breaks, the responsible conclusion is patience.\n"
            + "\n"
        )
        + (
            "Recent price movement should be read conservatively. The market report may show "
            + "momentum, reversal, support, or resistance, yet the final decision cannot assume "
            + "that movement is fundamentally supported when vendor calls or schema validation "
            + "failed. "
        )
        + (
            "A speculative move can look impressive on a chart while still offering poor entry "
            + "quality. The application should therefore avoid converting partial price evidence "
            + "into entry, stop-loss, or take-profit numbers that appear more precise than the "
            + "source data allows.\n"
            + "\n"
        )
        + (
            "The fundamental view also remains provisional. Revenue growth, net profit, margins, "
            + "cash flow quality, debt, liquidity, and shareholder context should be reviewed from "
            + "official or higher-priority vendors before conviction is raised. "
        )
        + (
            "If those numbers are available, they should support the thesis with period labels "
            + "and source metadata. If they are missing or inconsistent, the result should reduce "
            + "confidence rather than invent certainty. "
        )
        + (
            "In this fallback case, financial health is not rejected, but it is not strong "
            + "enough to override validation risk.\n"
            + "\n"
        )
        + (
            "Technical interpretation has the same limitation. Support, resistance, trend "
            + "direction, volume confirmation, and moving-average behavior can help only when the "
            + "current price anchor is reliable. "
        )
        + (
            "Without a clean price source, any trade level can become cosmetic. A valid Buy "
            + "would require an entry with a stop below it and a take-profit that preserves "
            + "exactly 1:3 risk/reward. "
        )
        + (
            "A valid Sell would need the opposite structure. If that cannot be validated, Hold "
            + "or Avoid new entry is the only defensible action.\n"
            + "\n"
        )
        + (
            "The risk assessment is High because the main threat is not simply market "
            + "volatility; it is decision quality. The top macro risk is broad market weakness, "
            + "the sector risk is a shift in liquidity or sentiment against comparable stocks, and "
            + "the company-specific risk is acting before official fundamentals and quote data "
            + "reconcile. "
        )
        + (
            "These risks are made worse when model output is too short, malformed, or repaired "
            + "by fallback rules.\n"
            + "\n"
        )
        + (
            f"The final positioning for the selected {time_horizon_text} horizon is to open no "
            "new exposure, keep suggested allocation at zero, and wait for a clean rerun. "
        )
        + (
            "The thesis could be upgraded if provider calls complete, official fundamentals "
            + "reconcile, price data is fresh, and the model returns a validated thesis with "
            + "actionable risk controls. "
        )
        + (
            "It should be downgraded if data remains missing, price breaks support, or "
            + "risk/reward cannot be validated."
        )
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
        confidence_score=0.0,
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
        position_sizing_reason=(
            "Fallback output and/or incomplete data quality require zero new allocation."
        ),
        rebalancing_action="Maintain position"
        if has_existing_position
        else "No position to rebalance",
        key_catalysts=[],
        key_reasons=[
            (
                "The final Portfolio Manager response could not be validated, so the backend "
                + "used a conservative safety fallback."
            ),
            (
                "Provider or model output should be rerun before any new entry, stop-loss, "
                + "take-profit, or allocation is trusted."
            ),
        ],
        invalidation_conditions=["Clean data and clean model output are not available."],
        price_target=None,
        time_horizon=time_horizon_text,
        current_price=data.last_close_price,
        current_price_as_of=data.last_close_price_as_of or trade_date,
        current_price_source=data.last_close_price_source
        if data.last_close_price is not None
        else None,
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
            (
                "Portfolio Manager output used schema-safe fallback because the model response "
                + "was invalid, short, or unavailable."
            )
        ],
    )
