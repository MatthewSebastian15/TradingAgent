from __future__ import annotations

from typing import Literal

from tradingagents.agents.prompts import ReportBundle, build_investment_debate_prompt
from tradingagents.agents.schemas import DebateArgument, render_debate_argument
from tradingagents.agents.utils.agent_utils import build_instrument_context
from tradingagents.agents.utils.structured import bind_structured, invoke_typed_or_none

ResearcherSide = Literal["bull", "bear"]

_SIDE_CONFIG = {
    "bull": {
        "label": "Bull Analyst",
        "node_name": "bull_researcher_node",
        "own_history_key": "bull_history",
        "opponent_history_key": "bear_history",
        "own_confidence_key": "bull_confidence",
        "opponent_confidence_key": "bear_confidence",
        "next_stage": "bear_turn",
        "next_speaker": "Bear Researcher",
    },
    "bear": {
        "label": "Bear Analyst",
        "node_name": "bear_researcher_node",
        "own_history_key": "bear_history",
        "opponent_history_key": "bull_history",
        "own_confidence_key": "bear_confidence",
        "opponent_confidence_key": "bull_confidence",
        "next_stage": "bull_turn",
        "next_speaker": "Bull Researcher",
    },
}


def _fallback_argument(
    side: ResearcherSide, label: str, confidence: float = 0.35
) -> DebateArgument:
    return DebateArgument(
        stance=side,
        thesis=f"{label} could not produce a fully validated argument, so confidence is low.",
        evidence=[
            "Structured output validation failed or the model returned incomplete reasoning.",
            (
                "The final decision should rely more heavily on validated analyst reports and "
                + "later manager synthesis."
            ),
        ],
        counterargument=(
            "The opposing case may be stronger until this side provides complete evidence."
        ),
        risk_flags=["Incomplete agent output", "Low confidence fallback used"],
        confidence=confidence,
        consensus_signal=False,
    )


def create_researcher(side: ResearcherSide, llm):
    config = _SIDE_CONFIG[side]
    label = config["label"]
    structured_llm = bind_structured(llm, DebateArgument, label)

    def researcher_node(state) -> dict:
        debate_state = state["investment_debate_state"]
        history = debate_state.get("history", "")
        own_history = debate_state.get(config["own_history_key"], "")

        bundle = ReportBundle(
            instrument_context=build_instrument_context(state["company_of_interest"]),
            market_report=state["market_report"],
            sentiment_report=state["sentiment_report"],
            news_report=state["news_report"],
            fundamentals_report=state["fundamentals_report"],
            debate_history=history,
            last_opponent_argument=debate_state.get("current_response", ""),
        )

        prompt = build_investment_debate_prompt(side, bundle)
        typed = invoke_typed_or_none(
            structured_llm,
            llm,
            prompt,
            DebateArgument,
            label,
        )

        if typed is None:
            typed = _fallback_argument(side, label)

        argument = render_debate_argument(typed, label)
        count = int(debate_state.get("count", 0)) + 1

        new_state = {
            **debate_state,
            "stage": config["next_stage"],
            "next_speaker": config["next_speaker"],
            "history": history + "\n" + argument,
            config["own_history_key"]: own_history + "\n" + argument,
            config["opponent_history_key"]: debate_state.get(config["opponent_history_key"], ""),
            "current_response": argument,
            config["own_confidence_key"]: typed.confidence,
            config["opponent_confidence_key"]: debate_state.get(
                config["opponent_confidence_key"], 0.0
            ),
            "last_consensus_signal": typed.consensus_signal,
            "consensus_reached": bool(typed.consensus_signal),
            "count": count,
        }

        return {"investment_debate_state": new_state}

    researcher_node.__name__ = config["node_name"]
    return researcher_node
