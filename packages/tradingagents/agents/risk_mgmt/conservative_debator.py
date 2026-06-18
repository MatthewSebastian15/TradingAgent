from __future__ import annotations

from tradingagents.agents.prompts import ReportBundle, build_risk_debate_prompt
from tradingagents.agents.schemas import DebateArgument, render_debate_argument
from tradingagents.agents.utils.agent_utils import build_instrument_context
from tradingagents.agents.utils.structured import bind_structured, invoke_typed_or_none


def _fallback_argument(side: str, label: str, confidence: float = 0.35) -> DebateArgument:
    return DebateArgument(
        stance=side,
        thesis="Conservative Analyst could not produce a fully validated risk argument, so confidence is low.",
        evidence=[
            "Structured output validation failed or the model returned incomplete reasoning.",
            "The final risk decision should rely more heavily on validated reports and portfolio manager synthesis.",
        ],
        counterargument="The other risk perspectives may be stronger until this side provides complete evidence.",
        risk_flags=["Incomplete risk output", "Low confidence fallback used"],
        confidence=confidence,
        consensus_signal=False,
    )


def create_conservative_debator(llm):
    structured_llm = bind_structured(llm, DebateArgument, "Conservative Analyst")

    def conservative_node(state) -> dict:
        risk_state = state["risk_debate_state"]
        history = risk_state.get("history", "")
        own_history = risk_state.get("conservative_history", "")

        bundle = ReportBundle(
            instrument_context=build_instrument_context(state["company_of_interest"]),
            market_report=state["market_report"],
            sentiment_report=state["sentiment_report"],
            news_report=state["news_report"],
            fundamentals_report=state["fundamentals_report"],
            debate_history=history,
            trader_plan=state["trader_investment_plan"],
        )
        latest_arguments = {
            "aggressive": risk_state.get("current_aggressive_response", ""),
            "conservative": risk_state.get("current_conservative_response", ""),
            "neutral": risk_state.get("current_neutral_response", ""),
        }

        prompt = build_risk_debate_prompt("conservative", bundle, latest_arguments)
        typed = invoke_typed_or_none(
            structured_llm,
            llm,
            prompt,
            DebateArgument,
            "Conservative Analyst",
        )

        if typed is None:
            typed = _fallback_argument("conservative", "Conservative Analyst")

        argument = render_debate_argument(typed, "Conservative Analyst")
        count = int(risk_state.get("count", 0)) + 1

        new_state = {
            **risk_state,
            "stage": "neutral_turn",
            "next_speaker": "Neutral Analyst",
            "history": history + "\n" + argument,
            "conservative_history": own_history + "\n" + argument,
            "latest_speaker": "Conservative",
            "current_conservative_response": argument,
            "conservative_confidence": typed.confidence,
            "last_consensus_signal": typed.consensus_signal,
            "consensus_reached": bool(typed.consensus_signal),
            "count": count,
        }

        return {"risk_debate_state": new_state}

    return conservative_node
