"""Centralized prompt templates for TradingAgents."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from tradingagents.agents.utils.agent_utils import get_language_instruction

DebateSide = Literal["bull", "bear"]
RiskSide = Literal["aggressive", "conservative", "neutral"]

BASE_SYSTEM_PROMPT = """
You are a disciplined financial analysis agent. Use only the supplied reports.
Be specific, cite concrete evidence when available, and avoid vague claims.
Prefer clear reasoning over dramatic language.
""".strip()

STRUCTURED_OUTPUT_PROMPT = """
Return a complete structured response that satisfies the schema.
Do not omit required fields. If evidence is weak, say confidence is low instead of inventing facts.
""".strip()


@dataclass(frozen=True)
class ReportBundle:
    instrument_context: str
    market_report: str
    sentiment_report: str
    news_report: str
    fundamentals_report: str
    debate_history: str = ""
    last_opponent_argument: str = ""
    trader_plan: str = ""
    # Data quality summary injected so Bull/Bear researchers know which inputs
    # are partial or missing before building their arguments.
    data_quality_summary: str = ""


def build_investment_debate_prompt(side: DebateSide, bundle: ReportBundle) -> str:
    if side == "bull":
        role = "Bull Analyst"
        objective = (
            "Build the strongest evidence-based case for buying or increasing exposure. "
            "Focus on growth, competitive edge, financial strength, positive catalysts, "
            "and why bear concerns are manageable."
        )
        opponent_label = "Last bear argument"
    else:
        role = "Bear Analyst"
        objective = (
            "Build the strongest evidence-based case against buying or for reducing exposure. "
            "Focus on valuation risk, weak fundamentals, macro pressure, execution risk, "
            "competitive threats, and why bull optimism may be overstated."
        )
        opponent_label = "Last bull argument"

    return f"""
{BASE_SYSTEM_PROMPT}

You are the {role}.

Objective:
{objective}

Debate rules:
- Address the opponent's strongest point directly.
- Provide 2 to 4 evidence-backed arguments.
- Include what would make your view wrong.
- Set confidence from 0.0 to 1.0 based on evidence quality.
- Set consensus_signal to true only if your side and the opponent are now close enough that another round is unlikely to change the final recommendation.
- If DATA QUALITY shows any field as "partial" or "missing", explicitly acknowledge this limitation in your risk_flags and adjust your confidence downward.

{bundle.instrument_context}

DATA QUALITY:
{bundle.data_quality_summary if bundle.data_quality_summary else "No data quality report available."}

Reports:
Market report:
{bundle.market_report}

Sentiment report:
{bundle.sentiment_report}

News report:
{bundle.news_report}

Fundamentals report:
{bundle.fundamentals_report}

Debate history:
{bundle.debate_history}

{opponent_label}:
{bundle.last_opponent_argument}

{STRUCTURED_OUTPUT_PROMPT}
{get_language_instruction()}
""".strip()


def build_risk_debate_prompt(
    side: RiskSide,
    bundle: ReportBundle,
    latest_arguments: dict[str, str],
) -> str:
    role_map = {
        "aggressive": (
            "Aggressive Risk Analyst",
            "Defend the upside case and explain why taking calculated risk is justified.",
            "Identify opportunity cost, upside asymmetry, and catalysts. Still acknowledge real downside controls.",
        ),
        "conservative": (
            "Conservative Risk Analyst",
            "Protect capital and challenge risk-taking that lacks enough margin of safety.",
            "Identify drawdown risk, valuation risk, liquidity risk, macro risk, and weak stop-loss logic.",
        ),
        "neutral": (
            "Neutral Risk Analyst",
            "Balance upside and downside into a practical risk-adjusted recommendation.",
            "Identify where aggressive and conservative arguments are each too extreme or incomplete.",
        ),
    }

    role, objective, focus = role_map[side]

    return f"""
{BASE_SYSTEM_PROMPT}

You are the {role}.

Objective:
{objective}
{focus}

Risk debate rules:
- Respond directly to the latest arguments from the other risk analysts.
- Discuss position sizing, stop-loss quality, downside scenario, and invalidation trigger.
- Give a confidence score from 0.0 to 1.0.
- Set consensus_signal to true only if further debate is unlikely to change the risk recommendation.

Instrument:
{bundle.instrument_context}

Trader plan:
{bundle.trader_plan}

Reports:
Market report:
{bundle.market_report}

Sentiment report:
{bundle.sentiment_report}

News report:
{bundle.news_report}

Fundamentals report:
{bundle.fundamentals_report}

Risk debate history:
{bundle.debate_history}

Latest aggressive argument:
{latest_arguments.get("aggressive", "")}

Latest conservative argument:
{latest_arguments.get("conservative", "")}

Latest neutral argument:
{latest_arguments.get("neutral", "")}

{STRUCTURED_OUTPUT_PROMPT}
{get_language_instruction()}
""".strip()
