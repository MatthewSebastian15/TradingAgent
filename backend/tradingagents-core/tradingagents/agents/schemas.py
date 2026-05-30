"""Pydantic schemas used by agents that produce structured output."""

from __future__ import annotations

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
            "Hold / Underweight / Sell. Reserve Hold for situations where the "
            "evidence on both sides is genuinely balanced; otherwise commit to "
            "the side with the stronger arguments."
        ),
    )
    rationale: str = Field(
        description=(
            "Conversational summary of the key points from both sides of the "
            "debate, ending with which arguments led to the recommendation. "
            "Speak naturally, as if to a teammate."
        ),
    )
    strategic_actions: str = Field(
        description=(
            "Concrete steps for the trader to implement the recommendation, "
            "including position sizing guidance consistent with the rating."
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
            "The case for this action, anchored in the analysts' reports and the research plan. Two to four sentences."
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
        description="Fixed reward/risk ratio for valid Buy/Sell setups. Must be 3.0, displayed as 1:3.",
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
            "Maintain position, Trim position, Exit position, or Avoid new entry."
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
        parts.extend(["", "**Invalidation Conditions**:", *[f"- {item}" for item in proposal.invalidation_conditions]])
    parts.extend(
        [
            "",
            f"FINAL TRANSACTION PROPOSAL: **{proposal.action.value.upper()}**",
        ]
    )
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Portfolio Manager
# ---------------------------------------------------------------------------


class PortfolioDecision(BaseModel):
    confidence_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Final confidence score for the recommendation after validation and debate synthesis.",
    )
    rating: PortfolioRating = Field(
        description=(
            "The final position rating. Exactly one of Buy / Overweight / Hold / "
            "Underweight / Sell, picked based on the analysts' debate."
        ),
    )
    executive_summary: str = Field(
        description=(
            "A single paragraph of EXACTLY 5 sentences summarizing the final decision. "
            "Sentence 1: state the rating and the single strongest reason for it. "
            "Sentence 2: cite the most important quantitative data point that supports this view (revenue growth, margin, market share, etc). "
            "Sentence 3: name the biggest risk or bear argument and explain in plain language why it does NOT override the bull case (or does, if Sell). "
            "Sentence 4: describe the recommended action, entry strategy, position sizing, and stop-loss level. "
            "Sentence 5: state the expected time horizon and what specific catalyst will confirm or invalidate the thesis. "
            "Write in plain, everyday language. Avoid jargon. No bullet points."
        ),
    )

    @field_validator("executive_summary")
    @classmethod
    def executive_summary_min_sentences(cls, v: str) -> str:
        """Reject summaries with fewer than 3 sentences.

        The schema asks for exactly 5, but enforcing a hard minimum of 3
        catches cases where the LLM returns a single-sentence stub while
        still allowing slight variation without breaking the pipeline.
        Sentences are split on period/exclamation/question mark followed
        by a space or end-of-string, so abbreviations inside a sentence
        rarely trigger false splits.
        """
        import re

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])(?:\s|$)", v) if s.strip()]
        if len(sentences) < 3:
            raise ValueError(
                f"executive_summary must contain at least 3 sentences; got {len(sentences)}. "
                "Expand the summary to meet the minimum requirement."
            )
        return v

    investment_thesis: str = Field(
        description=(
            "A thorough, easy-to-understand explanation of WHY this trade makes sense. "
            "Write as if explaining to a smart friend who does not work in finance. "
            "Structure the text as flowing paragraphs (no bullet points, no headers). "
            "Cover ALL of the following in order: "
            "(1) What does this company actually do and why does it matter right now? "
            "(2) What is the single biggest tailwind pushing the stock higher (or lower)? "
            "(3) What do the hard numbers say? Quote at least three specific metrics from the analysts' reports. "
            "(4) What is the bear case and how serious is it really? "
            "(5) Why does the bull case or bear case win overall? "
            "(6) What is the specific action plan: when to enter, how much to allocate, where to set the stop-loss, and when to take profit? "
            "Minimum length: 6 sentences. Use simple words."
        ),
    )
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
        description="Expected volatility level for the recommendation. Backend normalizes this to Low, Medium, High, or Very High.",
    )
    position_sizing_reason: str | None = Field(
        default=None,
        description="Reason for final allocation and position size.",
    )
    rebalancing_action: RebalancingAction | None = Field(
        default=None,
        description=(
            "Final portfolio action. Exactly one of Open new position, Add position, "
            "Maintain position, Trim position, Exit position, or Avoid new entry. Backend normalizes this again."
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
    has_existing_position: bool = Field(default=False)
    position_quantity: float | None = Field(default=None)
    average_entry_price: float | None = Field(default=None)
    position_action: str | None = Field(default=None)
    new_entry_action: str | None = Field(default=None)

    risk_reward_display: str | None = Field(
        default=None,
        description='Display string for fixed Risk:Reward. Must be "1:3" for valid Buy/Sell trade plans.',
    )
    risk_per_share: float | None = Field(default=None)
    reward_per_share: float | None = Field(default=None)

    volatility_score: float | None = Field(default=None)
    position_size_hint: str | None = Field(default=None)

    max_drawdown_min_pct: float | None = Field(default=None)
    max_drawdown_max_pct: float | None = Field(default=None)

    data_quality: dict[str, str] = Field(default_factory=dict)
    validation_warnings: list[str] = Field(default_factory=list)


def render_pm_decision(decision: PortfolioDecision) -> str:
    parts = [
        f"**Rating**: {decision.rating.value}",
        f"**Confidence Score**: {decision.confidence_score:.2f}",
        "",
        f"**Executive Summary**: {decision.executive_summary}",
        "",
        f"**Investment Thesis**: {decision.investment_thesis}",
    ]
    actionable_fields = [
        (
            "Suggested Allocation",
            f"{decision.suggested_allocation_percent}%" if decision.suggested_allocation_percent is not None else None,
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
    if decision.invalidation_conditions:
        parts.extend(["", "**Invalidation Conditions**:", *[f"- {item}" for item in decision.invalidation_conditions]])
    if decision.price_target is not None:
        parts.extend(["", f"**Price Target**: {decision.price_target}"])
    if decision.time_horizon:
        parts.extend(["", f"**Time Horizon**: {decision.time_horizon}"])
    return "\n".join(parts)
