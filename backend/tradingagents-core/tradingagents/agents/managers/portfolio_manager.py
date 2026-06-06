"""Portfolio Manager: synthesises the risk-analyst debate into the final decision."""

from __future__ import annotations

import logging

from tradingagents.agents.schemas import PortfolioDecision, render_pm_decision
from tradingagents.agents.utils.agent_utils import (
    build_instrument_context,
    get_language_instruction,
)
from tradingagents.agents.utils.structured import bind_structured

MAX_HISTORY_CHARS = 6000
logger = logging.getLogger(__name__)


def _trim_history(history: str, max_chars: int = MAX_HISTORY_CHARS) -> str:
    if len(history) <= max_chars:
        return history

    tail = history[-max_chars:]
    newline_pos = tail.find("\n")
    if newline_pos != -1:
        tail = tail[newline_pos + 1 :]

    return (
        "[Earlier debate history omitted to stay within model context limits. "
        "The most recent arguments from each analyst are preserved below.]\n\n" + tail
    )


def create_portfolio_manager(llm):
    structured_llm = bind_structured(llm, PortfolioDecision, "Portfolio Manager")

    def portfolio_manager_node(state) -> dict:
        instrument_context = build_instrument_context(state["company_of_interest"])

        raw_history = state["risk_debate_state"]["history"]
        history = _trim_history(raw_history)

        risk_debate_state = state["risk_debate_state"]
        research_plan = state["investment_plan"]
        trader_plan = state["trader_investment_plan"]

        past_context = state.get("past_context", "")
        lessons_line = f"- Lessons from prior decisions and outcomes:\n{past_context}\n" if past_context else ""

        prompt = f"""As the Portfolio Manager, synthesize the risk analysts' debate and deliver the final trading decision.

{instrument_context}

---

**Rating Scale** (use exactly one):
- **Buy**: Strong conviction to enter or add to position
- **Overweight**: Favorable outlook, gradually increase exposure
- **Hold**: Maintain current position, no action needed
- **Underweight**: Reduce exposure, take partial profits
- **Sell**: Exit position or avoid entry

**Context:**
- Research Manager's investment plan: **{research_plan}**
- Trader's transaction proposal: **{trader_plan}**
{lessons_line}**Risk Analysts Debate History:**
{history}

---

**Output requirements:**

Executive Summary: Write 250-300 words in exactly 5 parts, written as continuous paragraphs without headers, section numbers, or bullet points. Part 1 states the signal and single most important reason. Part 2 describes recent price movement and separates fundamental-driven movement from speculative movement. Part 3 briefly states revenue trend, profitability, and financial health. Part 4 states overall risk level and the top 2 risk factors. Part 5 clearly states what the user should do right now.

Investment Thesis: Write 400-450 words in exactly 6 parts, written as continuous paragraphs without headers, section numbers, or bullet points. Part 1 explains business overview, segments, and market position. Part 2 explains recent price movement and whether it is fundamentally supported or speculative. Part 3 covers revenue growth, profit margins, cashflow quality, and balance sheet strength with numbers where available. Part 4 identifies support, resistance, moving average conditions, and trend direction. Part 5 explains one macro risk, one sector risk, and one company-specific risk. Part 6 states the recommended action and the conditions that would upgrade or downgrade the recommendation.

Return a confidence_score from 0.0 to 1.0. Lower it when reports are incomplete, risk controls are weak, or debate evidence is mixed.

Also return confidence_breakdown as structured 0-100 integer scores for price_momentum, fundamental_quality, news_sentiment, risk_level_score, data_quality, and overall. Use risk_level_score so lower portfolio risk produces a higher score. The overall value must be a weighted average that is consistent with confidence_score after converting confidence_score to percent.

Be decisive. Ground every conclusion in specific evidence from the analysts.{get_language_instruction()}"""

        # Attempt structured output and capture the typed object.
        portfolio_decision_obj: PortfolioDecision | None = None
        final_trade_decision: str = ""

        if structured_llm is not None:
            try:
                portfolio_decision_obj = structured_llm.invoke(prompt)
                final_trade_decision = render_pm_decision(portfolio_decision_obj)
            except Exception as exc:
                logger.warning(
                    "Portfolio Manager: structured output failed (%s), falling back to free text",
                    exc,
                )
                portfolio_decision_obj = None

        if not final_trade_decision:
            # Free-text fallback — no typed object available.
            try:
                response = llm.invoke(prompt)
                final_trade_decision = response.content
            except Exception as exc:
                logger.error(
                    "Portfolio Manager: free-text fallback also failed (%s). "
                    "Returning placeholder so graph can continue.",
                    exc,
                )
                final_trade_decision = (
                    f"**Rating**: Hold\n\n"
                    f"**Executive Summary**: Portfolio Manager failed to produce analysis. "
                    f"Error: {exc}.\n\n"
                    f"**Investment Thesis**: Analysis unavailable due to model error."
                )

        new_risk_debate_state = {
            **risk_debate_state,
            "judge_decision": final_trade_decision,
            "history": raw_history,
            "aggressive_history": risk_debate_state["aggressive_history"],
            "conservative_history": risk_debate_state["conservative_history"],
            "neutral_history": risk_debate_state["neutral_history"],
            "latest_speaker": "Judge",
            "current_aggressive_response": risk_debate_state["current_aggressive_response"],
            "current_conservative_response": risk_debate_state["current_conservative_response"],
            "current_neutral_response": risk_debate_state["current_neutral_response"],
            "count": risk_debate_state["count"],
        }

        return {
            "risk_debate_state": new_risk_debate_state,
            "final_trade_decision": final_trade_decision,
            # Store the typed object so routes can read fields directly
            # without regex-parsing the rendered markdown string.
            "portfolio_decision": portfolio_decision_obj,
        }

    return portfolio_manager_node
