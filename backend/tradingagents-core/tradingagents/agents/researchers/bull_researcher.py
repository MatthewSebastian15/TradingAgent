from __future__ import annotations

from tradingagents.agents.prompts import ReportBundle, build_investment_debate_prompt
from tradingagents.agents.schemas import DebateArgument, render_debate_argument
from tradingagents.agents.utils.agent_utils import build_instrument_context
from tradingagents.agents.utils.structured import bind_structured, invoke_typed_or_none


def _fallback_argument(side: str, label: str, confidence: float = 0.35) -> DebateArgument:
    return DebateArgument(
        stance=side,
        thesis="Bull Analyst could not produce a fully validated argument, so confidence is low.",
        evidence=[
            "Structured output validation failed or the model returned incomplete reasoning.",
            "The final decision should rely more heavily on validated analyst reports and later manager synthesis.",
        ],
        counterargument="The opposing case may be stronger until this side provides complete evidence.",
        risk_flags=["Incomplete agent output", "Low confidence fallback used"],
        confidence=confidence,
        consensus_signal=False,
    )


def create_bull_researcher(llm):
    structured_llm = bind_structured(llm, DebateArgument, "Bull Analyst")

    def bull_node(state) -> dict:
        debate_state = state["investment_debate_state"]
        history = debate_state.get("history", "")
        bull_history = debate_state.get("bull_history", "")

        bundle = ReportBundle(
            instrument_context=build_instrument_context(state["company_of_interest"]),
            market_report=state["market_report"],
            sentiment_report=state["sentiment_report"],
            news_report=state["news_report"],
            fundamentals_report=state["fundamentals_report"],
            debate_history=history,
            last_opponent_argument=debate_state.get("current_response", ""),
        )

        prompt = build_investment_debate_prompt("bull", bundle)
        typed = invoke_typed_or_none(
            structured_llm,
            llm,
            prompt,
            DebateArgument,
            "Bull Analyst",
        )

        if typed is None:
            typed = _fallback_argument("bull", "Bull Analyst")

        argument = render_debate_argument(typed, "Bull Analyst")
        count = int(debate_state.get("count", 0)) + 1

        new_state = {
            **debate_state,
            "stage": "bear_turn",
            "next_speaker": "Bear Researcher",
            "history": history + "\n" + argument,
            "bull_history": bull_history + "\n" + argument,
            "bear_history": debate_state.get("bear_history", ""),
            "current_response": argument,
            "bull_confidence": typed.confidence,
            "bear_confidence": debate_state.get("bear_confidence", 0.0),
            "last_consensus_signal": typed.consensus_signal,
            "consensus_reached": bool(typed.consensus_signal),
            "count": count,
        }

        return {"investment_debate_state": new_state}

    return bull_node
