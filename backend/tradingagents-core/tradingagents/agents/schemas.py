"""Pydantic schemas used by agents that produce structured output."""

from __future__ import annotations

from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


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


class DebateArgument(BaseModel):
    stance: Literal["bull", "bear", "aggressive", "conservative", "neutral"] = Field(
        description="The agent viewpoint that produced this argument."
    )
    thesis: str = Field(
        min_length=20,
        description="One clear sentence stating the core argument.",
    )
    evidence: List[str] = Field(
        min_length=2,
        max_length=5,
        description="Specific evidence points from the supplied reports.",
    )
    counterargument: str = Field(
        min_length=20,
        description="Direct response to the strongest opposing argument.",
    )
    risk_flags: List[str] = Field(
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


def render_debate_argument(argument: DebateArgument, label: str) -> str:
    evidence = "\n".join(f"- {item}" for item in argument.evidence)
    risks = "\n".join(f"- {item}" for item in argument.risk_flags)

    if not risks:
        risks = "- No major additional risk flags stated."

    return "\n".join([
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
    ])


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
    return "\n".join([
        f"**Recommendation**: {plan.recommendation.value}",
        f"**Confidence**: {plan.confidence:.2f}",
        "",
        f"**Rationale**: {plan.rationale}",
        "",
        f"**Strategic Actions**: {plan.strategic_actions}",
    ])


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
            "The case for this action, anchored in the analysts' reports and "
            "the research plan. Two to four sentences."
        ),
    )
    entry_price: Optional[float] = Field(
        default=None,
        description="Optional entry price target in the instrument's quote currency.",
    )
    stop_loss: Optional[float] = Field(
        default=None,
        description="Optional stop-loss price in the instrument's quote currency.",
    )
    position_sizing: Optional[str] = Field(
        default=None,
        description="Optional sizing guidance, e.g. '5% of portfolio'.",
    )


def render_trader_proposal(proposal: TraderProposal) -> str:
    parts = [
        f"**Action**: {proposal.action.value}",
        f"**Confidence**: {proposal.confidence:.2f}",
        "",
        f"**Reasoning**: {proposal.reasoning}",
    ]
    if proposal.entry_price is not None:
        parts.extend(["", f"**Entry Price**: {proposal.entry_price}"])
    if proposal.stop_loss is not None:
        parts.extend(["", f"**Stop Loss**: {proposal.stop_loss}"])
    if proposal.position_sizing:
        parts.extend(["", f"**Position Sizing**: {proposal.position_sizing}"])
    parts.extend([
        "",
        f"FINAL TRANSACTION PROPOSAL: **{proposal.action.value.upper()}**",
    ])
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
    price_target: Optional[float] = Field(
        default=None,
        description="Optional target price in the instrument's quote currency.",
    )
    time_horizon: Optional[str] = Field(
        default=None,
        description="Optional recommended holding period, e.g. '3-6 months'.",
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
    if decision.price_target is not None:
        parts.extend(["", f"**Price Target**: {decision.price_target}"])
    if decision.time_horizon:
        parts.extend(["", f"**Time Horizon**: {decision.time_horizon}"])
    return "\n".join(parts)
