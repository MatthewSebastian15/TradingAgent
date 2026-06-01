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

Executive Summary: Write 150-200 words in one paragraph. No bullet points. Summarize the final rating, strongest reason, key quantitative support, biggest risk, recommended action, entry strategy, sizing, stop-loss context, time horizon, and confirmation or invalidation catalyst.

Investment Thesis: Write 250-350 words as flowing paragraphs. No bullet points and no headers. Explain what the company does, why it matters now, the biggest tailwind or headwind, at least three specific numbers from the analysts' reports, the bear case, why one side wins, and the full action plan including entry, sizing, stop-loss, and profit-taking. Avoid unexplained jargon.

Return a confidence_score from 0.0 to 1.0. Lower it when reports are incomplete, risk controls are weak, or debate evidence is mixed.

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
