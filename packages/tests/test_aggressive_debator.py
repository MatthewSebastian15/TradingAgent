from tradingagents.agents.risk_mgmt.aggressive_debator import create_aggressive_debator
from tradingagents.agents.schemas import DebateArgument

ARGUMENT = DebateArgument(
    stance="aggressive",
    thesis="Upside asymmetry justifies a calculated risk position at current levels.",
    evidence=["Catalysts are stacked for the next quarter.", "Downside is protected by support."],
    counterargument="Conservative concerns about drawdown are valid but priced in already.",
    risk_flags=["Volatility spike risk"],
    confidence=0.7,
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
            "history": "earlier risk debate",
            "aggressive_history": "",
            "current_aggressive_response": "",
            "current_conservative_response": "conservative said X",
            "current_neutral_response": "neutral said Y",
            "count": 1,
        },
    }


def test_aggressive_node_updates_state(fake_debate_llm):
    llm = fake_debate_llm(ARGUMENT)
    node = create_aggressive_debator(llm)
    new_state = node(_state())["risk_debate_state"]

    assert new_state["stage"] == "conservative_turn"
    assert new_state["next_speaker"] == "Conservative Analyst"
    assert new_state["latest_speaker"] == "Aggressive"
    assert new_state["count"] == 2
    assert new_state["aggressive_confidence"] == 0.7
    assert "Aggressive Analyst:" in new_state["current_aggressive_response"]
    assert ARGUMENT.thesis in new_state["history"]

    prompt = llm.structured.prompts[0]
    assert "trader plan text" in prompt
    assert "conservative said X" in prompt
    assert "neutral said Y" in prompt


def test_invalid_output_uses_low_confidence_fallback(fake_debate_llm):
    node = create_aggressive_debator(fake_debate_llm("garbage"))
    new_state = node(_state())["risk_debate_state"]
    assert new_state["aggressive_confidence"] == 0.0
    assert (
        "could not produce a fully validated risk argument"
        in (new_state["current_aggressive_response"])
    )
    assert new_state["consensus_reached"] is False
