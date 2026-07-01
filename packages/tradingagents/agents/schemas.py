"""Pydantic schemas used by agents that produce structured output."""

from __future__ import annotations

import re
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PortfolioRating(str, Enum):
    BUY = "Buy"
    OVERWEIGHT = "Overweight"
    HOLD = "Hold"
    UNDERWEIGHT = "Underweight"
    SELL = "Sell"


class TraderAction(str, Enum):
    BUY = "Buy"
    HOLD = "Hold"
    SELL = "Sell"


class VolatilityLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"
    VERY_HIGH = "Very High"


class RebalancingAction(str, Enum):
    OPEN_NEW_POSITION = "Open new position"
    ADD_POSITION = "Add position"
    MAINTAIN_POSITION = "Maintain position"
    TRIM_POSITION = "Trim position"
    EXIT_POSITION = "Exit position"
    AVOID_NEW_ENTRY = "Avoid new entry"
    NO_POSITION_TO_REBALANCE = "No position to rebalance"


class DebateArgument(BaseModel):
    stance: Literal["bull", "bear", "aggressive", "conservative", "neutral"] = Field(
        description="The agent viewpoint that produced this argument."
    )
    thesis: str = Field(
        min_length=20,
        description="One clear sentence stating the core argument.",
    )
    evidence: list[str] = Field(
        min_length=2,
        max_length=5,
        description="Specific evidence points from the supplied reports.",
    )
    counterargument: str = Field(
        min_length=20,
        description="Direct response to the strongest opposing argument.",
    )
    risk_flags: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Risks, missing data, or assumptions that could weaken this argument.",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in this viewpoint based on evidence quality.",
    )
    consensus_signal: bool = Field(
        default=False,
        description="True when another round is unlikely to materially change the debate.",
    )

    @field_validator("risk_flags", mode="before")
    @classmethod
    def clamp_risk_flags(cls, value):
        """Normalize risk flags before max_length validation is applied."""
        if value is None:
            return []

        if isinstance(value, str):
            value = [value]

        if not isinstance(value, list):
            return []

        cleaned: list[str] = []
        seen: set[str] = set()

        for item in value:
            text = str(item).strip()
            if not text or text in seen:
                continue

            seen.add(text)
            cleaned.append(text)

            if len(cleaned) >= 5:
                break

        return cleaned


def render_debate_argument(argument: DebateArgument, label: str) -> str:
    evidence = "\n".join(f"- {item}" for item in argument.evidence)
    risks = "\n".join(f"- {item}" for item in argument.risk_flags)

    if not risks:
        risks = "- No major additional risk flags stated."

    return "\n".join(
        [
            f"{label}: {argument.thesis}",
            "",
            "Evidence:",
            evidence,
            "",
            f"Counterargument: {argument.counterargument}",
            "",
            "Risk flags:",
            risks,
            "",
            f"Confidence: {argument.confidence:.2f}",
            f"Consensus Signal: {argument.consensus_signal}",
        ]
    )


# ---------------------------------------------------------------------------
# Research Manager
# ---------------------------------------------------------------------------


class ResearchPlan(BaseModel):
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in the recommendation after evaluating bull and bear evidence.",
    )
    recommendation: PortfolioRating = Field(
        description=(
            "The investment recommendation. Exactly one of Buy / Overweight / "
            + "Hold / Underweight / Sell. Reserve Hold for situations where the "
            + "evidence on both sides is genuinely balanced; otherwise commit to "
            + "the side with the stronger arguments."
        ),
    )
    rationale: str = Field(
        description=(
            "Conversational summary of the key points from both sides of the "
            + "debate, ending with which arguments led to the recommendation. "
            + "Speak naturally, as if to a teammate."
        ),
    )
    strategic_actions: str = Field(
        description=(
            "Concrete steps for the trader to implement the recommendation, "
            + "including position sizing guidance consistent with the rating."
        ),
    )


def render_research_plan(plan: ResearchPlan) -> str:
    return "\n".join(
        [
            f"**Recommendation**: {plan.recommendation.value}",
            f"**Confidence**: {plan.confidence:.2f}",
            "",
            f"**Rationale**: {plan.rationale}",
            "",
            f"**Strategic Actions**: {plan.strategic_actions}",
        ]
    )


# ---------------------------------------------------------------------------
# Trader
# ---------------------------------------------------------------------------


class TraderProposal(BaseModel):
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in the transaction proposal.",
    )
    action: TraderAction = Field(
        description="The transaction direction. Exactly one of Buy / Hold / Sell.",
    )
    reasoning: str = Field(
        description=(
            "The case for this action, anchored in the analysts' reports and the research "
            + "plan. Two to four sentences."
        ),
    )
    suggested_allocation_percent: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Suggested portfolio allocation percentage for this position.",
    )
    entry_price: float | None = Field(
        default=None,
        description="Optional entry price target in the instrument's quote currency.",
    )
    stop_loss: float | None = Field(
        default=None,
        description="Optional stop-loss price in the instrument's quote currency.",
    )
    take_profit: float | None = Field(
        default=None,
        description="Optional take-profit price in the instrument's quote currency.",
    )
    risk_reward_ratio: float | None = Field(
        default=None,
        description=(
            "Fixed reward/risk ratio for valid Buy/Sell setups. Must be 3.0, displayed as 1:3."
        ),
    )
    max_drawdown_estimate: str | None = Field(
        default=None,
        description="Estimated adverse move or drawdown range, e.g. '8-12%'.",
    )
    volatility_level: VolatilityLevel | None = Field(
        default=None,
        description="Expected volatility level for the position.",
    )
    position_sizing: str | None = Field(
        default=None,
        description="Optional sizing guidance, e.g. '5% of portfolio'.",
    )
    position_sizing_reason: str | None = Field(
        default=None,
        description="Plain-language reason for the suggested allocation and sizing.",
    )
    rebalancing_action: RebalancingAction | None = Field(
        default=None,
        description=(
            "Concrete portfolio action. Exactly one of Open new position, Add position, "
            + (
                "Maintain position, Trim position, Exit position, Avoid new entry, or No "
                + "position to rebalance."
            )
        ),
    )

    @field_validator("rebalancing_action", mode="before")
    @classmethod
    def normalize_rebalancing_action(cls, value: object) -> object:
        if value is None or value == "":
            return None
        raw = getattr(value, "value", value)
        allowed = {item.value for item in RebalancingAction}
        return raw if raw in allowed else None

    key_catalysts: list[str] = Field(
        default_factory=list,
        max_length=6,
        description="Specific events or conditions that could drive the trade.",
    )
    invalidation_conditions: list[str] = Field(
        default_factory=list,
        max_length=6,
        description="Conditions that invalidate the trade thesis.",
    )


def render_trader_proposal(proposal: TraderProposal) -> str:
    parts = [
        f"**Action**: {proposal.action.value}",
        f"**Confidence**: {proposal.confidence:.2f}",
        "",
        f"**Reasoning**: {proposal.reasoning}",
    ]
    if proposal.suggested_allocation_percent is not None:
        parts.extend(["", f"**Suggested Allocation**: {proposal.suggested_allocation_percent}%"])
    if proposal.entry_price is not None:
        parts.extend(["", f"**Entry Price**: {proposal.entry_price}"])
    if proposal.stop_loss is not None:
        parts.extend(["", f"**Stop Loss**: {proposal.stop_loss}"])
    if proposal.take_profit is not None:
        parts.extend(["", f"**Take Profit**: {proposal.take_profit}"])
    if proposal.risk_reward_ratio is not None:
        parts.extend(["", f"**Risk/Reward Ratio**: {proposal.risk_reward_ratio}"])
    if proposal.max_drawdown_estimate:
        parts.extend(["", f"**Max Drawdown Estimate**: {proposal.max_drawdown_estimate}"])
    if proposal.volatility_level:
        parts.extend(["", f"**Volatility Level**: {proposal.volatility_level.value}"])
    if proposal.position_sizing:
        parts.extend(["", f"**Position Sizing**: {proposal.position_sizing}"])
    if proposal.position_sizing_reason:
        parts.extend(["", f"**Position Sizing Reason**: {proposal.position_sizing_reason}"])
    if proposal.rebalancing_action:
        parts.extend(["", f"**Rebalancing Action**: {proposal.rebalancing_action.value}"])
    if proposal.key_catalysts:
        parts.extend(["", "**Key Catalysts**:", *[f"- {item}" for item in proposal.key_catalysts]])
    if proposal.invalidation_conditions:
        parts.extend(
            [
                "",
                "**Invalidation Conditions**:",
                *[f"- {item}" for item in proposal.invalidation_conditions],
            ]
        )
    parts.extend(
        [
            "",
            f"FINAL TRANSACTION PROPOSAL: **{proposal.action.value.upper()}**",
        ]
    )
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Technical Levels
# ---------------------------------------------------------------------------


class TechnicalLevels(BaseModel):
    current_price: float = Field(description="Current market price anchor for the analysis.")
    nearest_support: float | None = Field(default=None)
    nearest_resistance: float | None = Field(default=None)
    suggested_stop_loss: float | None = Field(default=None)
    invalidation_level: float | None = Field(default=None)
    entry_range_low: float | None = Field(default=None)
    entry_range_high: float | None = Field(default=None)
    risk_reward_ratio: str | None = Field(
        default=None,
        description='Display value such as "1:2.1" or "Not attractive".',
    )
    technical_levels_available: bool = Field(default=True)


# ---------------------------------------------------------------------------
# Portfolio Manager
# ---------------------------------------------------------------------------


_WORD_RE = re.compile(r"[^\W_]+(?:[.'-][^\W_]+)*", re.UNICODE)


def _word_count(text: str) -> int:
    return len(_WORD_RE.findall(text or ""))


def _validate_word_range(field_name: str, value: str, min_words: int, max_words: int) -> str:
    text = (value or "").strip()
    count = _word_count(text)

    if count < min_words or count > max_words:
        raise ValueError(f"{field_name} must be {min_words}-{max_words} words; got {count} words.")

    return text


class ConfidenceBreakdown(BaseModel):
    price_momentum: int = Field(ge=0, le=100, description="Price momentum score, 0-100.")
    fundamental_quality: int = Field(ge=0, le=100, description="Fundamental quality score, 0-100.")
    news_sentiment: int = Field(ge=0, le=100, description="News sentiment score, 0-100.")
    risk_level_score: int = Field(
        ge=0,
        le=100,
        description="Risk score where lower portfolio risk produces a higher score, 0-100.",
    )
    data_quality: int = Field(ge=0, le=100, description="Input data quality score, 0-100.")
    overall: int = Field(ge=0, le=100, description="Weighted overall confidence score, 0-100.")


class PortfolioDecision(BaseModel):
    confidence_score: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "Final confidence score for the recommendation after validation and debate synthesis."
        ),
    )
    confidence_breakdown: ConfidenceBreakdown | None = Field(
        default=None,
        description=(
            "Structured 0-100 score breakdown for price momentum, fundamental quality, "
            + "news sentiment, risk level, data quality, and weighted overall confidence."
        ),
    )
    rating: PortfolioRating = Field(
        description=(
            "The final position rating. Exactly one of Buy / Overweight / Hold / "
            + "Underweight / Sell, picked based on the analysts' debate."
        ),
    )
    executive_summary: str = Field(
        description=(
            (
                "Write 250-300 words in exactly 5 continuous paragraphs without headers, "
                + "numbering, or bullets. "
            )
            + "Part 1 states the recommendation and the single most important reason. "
            + (
                "Part 2 explains recent price action and separates fundamental movement from "
                + "speculation. "
            )
            + "Part 3 summarizes revenue trend, profitability, and financial health. "
            + "Part 4 states overall risk level and the top two risk factors. "
            + "Part 5 gives the immediate action the user should take."
        ),
    )

    @field_validator("executive_summary")
    @classmethod
    def executive_summary_word_range(cls, v: str) -> str:
        return _validate_word_range("executive_summary", v, 150, 300)

    investment_thesis: str = Field(
        description=(
            (
                "Write 400-450 words in exactly 6 continuous paragraphs without headers, "
                + "numbering, or bullets. "
            )
            + (
                "Cover business overview, recent price movement, fundamental view, technical "
                + "view, risk assessment, "
            )
            + (
                "and final positioning. Include specific numbers where available and clearly "
                + "state upgrade or downgrade conditions."
            )
        ),
    )

    @field_validator("investment_thesis")
    @classmethod
    def investment_thesis_word_range(cls, v: str) -> str:
        return _validate_word_range("investment_thesis", v, 250, 450)

    suggested_allocation_percent: float | None = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Final suggested allocation percentage for the position.",
    )
    entry_price: float | None = Field(
        default=None,
        description="Final entry price target in the instrument's quote currency.",
    )
    stop_loss: float | None = Field(
        default=None,
        description="Final stop-loss price in the instrument's quote currency.",
    )
    take_profit: float | None = Field(
        default=None,
        description="Final take-profit price in the instrument's quote currency.",
    )
    risk_reward_ratio: float | None = Field(
        default=None,
        description="Final fixed reward/risk ratio. Must be 3.0, displayed as 1:3.",
    )
    max_drawdown_estimate: str | None = Field(
        default=None,
        description="Estimated maximum drawdown or adverse move for the trade.",
    )
    volatility_level: VolatilityLevel | str | None = Field(
        default=None,
        description=(
            "Expected volatility level for the recommendation. Backend normalizes this to Low, "
            + "Medium, High, or Very High."
        ),
    )
    position_sizing_reason: str | None = Field(
        default=None,
        description="Reason for final allocation and position size.",
    )
    rebalancing_action: RebalancingAction | None = Field(
        default=None,
        description=(
            "Final portfolio action. Exactly one of Open new position, Add position, "
            + (
                "Maintain position, Trim position, Exit position, Avoid new entry, or No "
                + "position to rebalance. Backend normalizes this again."
            )
        ),
    )

    @field_validator("rebalancing_action", mode="before")
    @classmethod
    def normalize_rebalancing_action(cls, value: object) -> object:
        if value is None or value == "":
            return None
        raw = getattr(value, "value", value)
        allowed = {item.value for item in RebalancingAction}
        return raw if raw in allowed else None

    key_catalysts: list[str] = Field(
        default_factory=list,
        max_length=8,
        description="Key catalysts that support the final recommendation.",
    )
    key_reasons: list[str] = Field(
        default_factory=list,
        max_length=8,
        description=(
            (
                "Primary reasons supporting the final recommendation. Items must be written so "
                + "they can be "
            )
            + (
                "combined into one coherent 75-125 word paragraph for the dashboard. Avoid "
                + "fragments, labels, "
            )
            + "or duplicate ideas."
        ),
    )
    key_reasons_paragraph: str | None = Field(
        default=None,
        description="One coherent paragraph summarizing the key reasons in 75-125 words.",
    )
    invalidation_conditions: list[str] = Field(
        default_factory=list,
        max_length=8,
        description="Specific conditions that invalidate the final thesis.",
    )
    price_target: float | None = Field(
        default=None,
        description="Optional target price in the instrument's quote currency.",
    )
    time_horizon: str | None = Field(
        default=None,
        description="Optional recommended holding period, e.g. '3-6 months'.",
    )

    decision: str | None = Field(
        default=None,
        description="Backward-compatible final decision alias after backend validation.",
    )
    current_price: float | None = Field(default=None)
    current_price_as_of: str | None = Field(default=None)
    current_price_source: str | None = Field(default=None)

    llm_decision: str | None = Field(default=None)
    final_decision: str | None = Field(default=None)
    decision_adjusted: bool = Field(default=False)
    decision_adjusted_reason: str | None = Field(default=None)

    trade_plan_valid: bool = Field(default=False)
    has_existing_position: bool = Field(
        default=False,
        description=(
            "Resolved final flag that indicates whether the user already owns this long position."
        ),
    )
    position_quantity: float | None = Field(
        default=None,
        description=(
            "User's current position quantity when provided. Backend uses explicit quantity to "
            + "resolve position context."
        ),
    )
    average_entry_price: float | None = Field(
        default=None,
        description="User's average entry price for the existing position when available.",
    )
    position_action: str | None = Field(
        default=None,
        description="Action for an existing position only. Null when the user has no position.",
    )
    new_entry_action: str | None = Field(
        default=None,
        description=(
            "Instruction for opening new exposure. For existing positions, this must not imply a "
            + "separate new trade."
        ),
    )

    risk_reward_display: str | None = Field(
        default=None,
        description=(
            'Display string for fixed Risk:Reward. Must be "1:3" for valid Buy/Sell trade plans.'
        ),
    )
    risk_per_share: float | None = Field(default=None)
    reward_per_share: float | None = Field(default=None)

    volatility_score: float | None = Field(default=None)
    position_size_hint: str | None = Field(
        default=None,
        description=(
            "Contextual sizing guidance for new entry, add, maintain, trim, or exit actions."
        ),
    )

    max_drawdown_min_pct: float | None = Field(default=None)
    max_drawdown_max_pct: float | None = Field(default=None)

    data_quality: dict[str, str] = Field(default_factory=dict)
    validation_warnings: list[str] = Field(default_factory=list)


class SelfCritiqueResult(BaseModel):
    """9A: adversarial review of the final decision against its inputs (deep mode only)."""

    should_downgrade: bool = Field(
        description=(
            "True only if a listed violation is serious enough that the Buy/Sell decision "
            "must be downgraded to a cautious Hold. False when the decision is sound."
        ),
    )
    violations: list[str] = Field(
        default_factory=list,
        description=(
            "Concrete problems: the decision contradicts an input value, overstates "
            "confidence given the data quality, or relies on missing/stale data. "
            "Empty when the decision holds up."
        ),
    )


def render_pm_decision(decision: PortfolioDecision) -> str:
    parts = [
        f"**Rating**: {decision.rating.value}",
        f"**Confidence Score**: {decision.confidence_score:.2f}",
        "",
        f"**Executive Summary**: {decision.executive_summary}",
        "",
        f"**Investment Thesis**: {decision.investment_thesis}",
    ]
    if decision.confidence_breakdown is not None:
        breakdown = decision.confidence_breakdown
        parts.extend(
            [
                "",
                "**Confidence Breakdown**:",
                f"- Price Momentum: {breakdown.price_momentum}/100",
                f"- Fundamental Quality: {breakdown.fundamental_quality}/100",
                f"- News Sentiment: {breakdown.news_sentiment}/100",
                f"- Risk Level: {breakdown.risk_level_score}/100",
                f"- Data Quality: {breakdown.data_quality}/100",
                f"- Overall: {breakdown.overall}/100",
            ]
        )

    actionable_fields = [
        (
            "Suggested Allocation",
            f"{decision.suggested_allocation_percent}%"
            if decision.suggested_allocation_percent is not None
            else None,
        ),
        ("Entry Price", decision.entry_price),
        ("Stop Loss", decision.stop_loss),
        ("Take Profit", decision.take_profit),
        ("Risk/Reward Ratio", decision.risk_reward_display or decision.risk_reward_ratio),
        ("Max Drawdown Estimate", decision.max_drawdown_estimate),
        (
            "Volatility Level",
            decision.volatility_level.value
            if isinstance(decision.volatility_level, VolatilityLevel)
            else decision.volatility_level,
        ),
        ("Volatility Score", decision.volatility_score),
        ("Position Size Hint", decision.position_size_hint),
        ("Position Sizing Reason", decision.position_sizing_reason),
        (
            "Rebalancing Action",
            decision.rebalancing_action.value
            if isinstance(decision.rebalancing_action, RebalancingAction)
            else decision.rebalancing_action,
        ),
    ]
    for label, value in actionable_fields:
        if value is not None:
            parts.extend(["", f"**{label}**: {value}"])
    if decision.key_catalysts:
        parts.extend(["", "**Key Catalysts**:", *[f"- {item}" for item in decision.key_catalysts]])
    if decision.key_reasons:
        parts.extend(["", "**Key Reasons**:", *[f"- {item}" for item in decision.key_reasons]])
    if decision.invalidation_conditions:
        parts.extend(
            [
                "",
                "**Invalidation Conditions**:",
                *[f"- {item}" for item in decision.invalidation_conditions],
            ]
        )
    if decision.price_target is not None:
        parts.extend(["", f"**Price Target**: {decision.price_target}"])
    if decision.time_horizon:
        parts.extend(["", f"**Time Horizon**: {decision.time_horizon}"])
    return "\n".join(parts)
