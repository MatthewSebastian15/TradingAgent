"""Portfolio Manager: synthesises the risk-analyst debate into the final decision."""

from __future__ import annotations

from tradingagents.agents.schemas import PortfolioDecision, render_pm_decision
from tradingagents.agents.utils.agent_utils import (
    build_instrument_context,
    get_language_instruction,
)
from tradingagents.agents.utils.structured import (
    bind_structured,
    invoke_structured_or_freetext,
)

MAX_HISTORY_CHARS = 6000


def _trim_history(history: str, max_chars: int = MAX_HISTORY_CHARS) -> str:
    if len(history) <= max_chars:
        return history

    tail = history[-max_chars:]
    newline_pos = tail.find("\n")
    if newline_pos != -1:
        tail = tail[newline_pos + 1:]

    return (
        "[Earlier debate history omitted to stay within model context limits. "
        "The most recent arguments from each analyst are preserved below.]\n\n"
        + tail
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
        lessons_line = (
            f"- Lessons from prior decisions and outcomes:\n{past_context}\n"
            if past_context
            else ""
        )

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
{lessons_line}
**Risk Analysts Debate History:**
{history}

---

**Output requirements:**

Executive Summary: Write EXACTLY 5 sentences in one paragraph. No bullet points.
- Sentence 1: State the rating and the single strongest reason for it.
- Sentence 2: Cite the most important quantitative data point that supports this view.
- Sentence 3: Name the biggest risk and explain why it does NOT change the decision (or does, if Sell).
- Sentence 4: Describe the recommended entry strategy, position sizing, and stop-loss level.
- Sentence 5: State the time horizon and the catalyst that will confirm or invalidate the thesis.

Investment Thesis: Write at minimum 6 sentences as flowing paragraphs (no bullet points, no headers). Explain in plain, everyday language as if talking to a smart friend who does not work in finance. Cover: what the company does and why it matters now, the biggest tailwind or headwind, at least three specific numbers from the analysts' reports, the bear case and how serious it is, why one side wins the argument, and the full action plan (entry, sizing, stop-loss, profit-taking). Avoid unexplained jargon.

Be decisive. Ground every conclusion in specific evidence from the analysts.{get_language_instruction()}"""

        final_trade_decision = invoke_structured_or_freetext(
            structured_llm,
            llm,
            prompt,
            render_pm_decision,
            "Portfolio Manager",
        )

        new_risk_debate_state = {
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
        }

    return portfolio_manager_node