from tradingagents.agents.risk_mgmt.neutral_debator import create_neutral_debator
from tradingagents.agents.schemas import DebateArgument

ARGUMENT = DebateArgument(
    stance="neutral",
    thesis="A half-size position balances the upside case against real drawdown risk.",
    evidence=["Aggressive case ignores macro pressure.", "Conservative case ignores catalysts."],
    counterargument="Both extremes overstate certainty; sizing should reflect mixed evidence.",
    risk_flags=[],
    confidence=0.55,
    consensus_signal=False,
)


def _state():
    return {
        "company_of_interest": "BBCA.JK",
        "market_report": "market ok",
        "sentiment_report": "sentiment ok",
        "news_report": "news ok",
        "fundamentals_report": "fundamentals ok",
        "trader_investment_plan": "trader plan text",
        "risk_debate_state": {
            "history": "",
            "neutral_history": "",
            "current_aggressive_response": "",
            "current_conservative_response": "",
            "current_neutral_response": "",
            "count": 2,
        },
    }


def test_neutral_node_updates_state(fake_debate_llm):
    node = create_neutral_debator(fake_debate_llm(ARGUMENT))
    new_state = node(_state())["risk_debate_state"]

    assert new_state["stage"] == "aggressive_turn"
    assert new_state["next_speaker"] == "Aggressive Analyst"
    assert new_state["latest_speaker"] == "Neutral"
    assert new_state["count"] == 3
    assert new_state["neutral_confidence"] == 0.55
    assert "Neutral Analyst:" in new_state["current_neutral_response"]
    # empty risk_flags rendered with default note
    assert "No major additional risk flags stated." in new_state["current_neutral_response"]


def test_invalid_output_uses_low_confidence_fallback(fake_debate_llm):
    node = create_neutral_debator(fake_debate_llm(None))
    new_state = node(_state())["risk_debate_state"]
    assert new_state["neutral_confidence"] == 0.0
    assert (
        "could not produce a fully validated risk argument"
        in (new_state["current_neutral_response"])
    )
