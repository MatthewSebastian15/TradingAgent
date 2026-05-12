"""Portfolio Manager: synthesises the risk-analyst debate into the final decision.

Uses LangChain's ``with_structured_output`` so the LLM produces a typed
``PortfolioDecision`` directly, in a single call.  The result is rendered
back to markdown for storage in ``final_trade_decision`` so memory log,
CLI display, and saved reports continue to consume the same shape they do
today.  When a provider does not expose structured output, the agent falls
back gracefully to free-text generation.

CHANGES vs original:
- Added ``_trim_history`` helper that caps the risk-debate history fed into
  the prompt at MAX_HISTORY_CHARS characters. The full history is still
  stored in ``risk_debate_state``; only the prompt input is trimmed. This
  prevents qwen3:4b (or any small model) from receiving a context that is
  longer than its practical attention window, which is a common cause of
  very slow generation or a hung call at the Portfolio Manager step.
- The trim always preserves the tail of the history (most recent arguments)
  because those are what the Portfolio Manager should weigh most heavily.
"""

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

# Maximum characters of debate history to feed into the PM prompt.
# The three risk analysts each produce ~500-1500 chars per turn, so at
# max_risk_discuss_rounds=1 the raw history is typically 1500-4500 chars.
# Setting this to 6000 gives comfortable headroom while keeping the total
# prompt well inside qwen3:4b's usable context window.
# Increase if you use a model with a larger context (e.g. 32k+).
MAX_HISTORY_CHARS = 6000


def _trim_history(history: str, max_chars: int = MAX_HISTORY_CHARS) -> str:
    """Return the tail of ``history`` capped at ``max_chars`` characters.

    The most recent analyst arguments appear at the end of the string, so
    trimming from the front discards the oldest (least relevant) text while
    keeping everything the Portfolio Manager needs to make its decision.

    A header line is prepended when trimming occurs so the model understands
    that earlier context exists but was omitted.

    Args:
        history: Full concatenated debate history string.
        max_chars: Hard character limit for the returned string.

    Returns:
        Original string when it fits; trimmed tail with a notice header otherwise.
    """
    if len(history) <= max_chars:
        return history

    tail = history[-max_chars:]

    # Avoid breaking in the middle of a word or analyst label: advance to
    # the next newline so the first line in the returned string is complete.
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

        # Trim history before injecting into the prompt to prevent overly
        # large inputs from stalling the model. The full history is retained
        # in risk_debate_state for logging and downstream use.
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

Be decisive and ground every conclusion in specific evidence from the analysts.{get_language_instruction()}"""

        final_trade_decision = invoke_structured_or_freetext(
            structured_llm,
            llm,
            prompt,
            render_pm_decision,
            "Portfolio Manager",
        )

        new_risk_debate_state = {
            "judge_decision": final_trade_decision,
            # Store the full (untrimmed) history so logs and reports are complete.
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