from tradingagents.agents.researchers.researcher_factory import create_researcher
from tradingagents.agents.schemas import DebateArgument

ARGUMENT = DebateArgument(
    stance="bull",
    thesis="Strong revenue growth supports upside over the next quarter.",
    evidence=["Revenue grew 12% YoY.", "Margins expanded two quarters in a row."],
    counterargument="Valuation premium is a risk but manageable given the growth rate.",
    risk_flags=["Valuation premium"],
    confidence=0.8,
    consensus_signal=False,
)


def _state(debate_overrides=None):
    return {
        "company_of_interest": "BBCA.JK",
        "market_report": "market ok",
        "sentiment_report": "sentiment ok",
        "news_report": "news ok",
        "fundamentals_report": "fundamentals ok",
        "investment_debate_state": {
            "history": "earlier debate",
            "bull_history": "",
            "bear_history": "prior bear text",
            "current_response": "last opponent argument",
            "count": 2,
            **(debate_overrides or {}),
        },
    }


def test_bull_researcher_updates_state(fake_debate_llm):
    llm = fake_debate_llm(ARGUMENT)
    node = create_researcher("bull", llm)
    assert node.__name__ == "bull_researcher_node"

    result = node(_state())
    new_state = result["investment_debate_state"]
    assert new_state["stage"] == "bear_turn"
    assert new_state["next_speaker"] == "Bear Researcher"
    assert new_state["count"] == 3
    assert new_state["bull_confidence"] == 0.8
    assert new_state["bear_history"] == "prior bear text"  # opponent history untouched
    assert "Bull Analyst:" in new_state["current_response"]
    assert ARGUMENT.thesis in new_state["history"]
    assert new_state["consensus_reached"] is False

    # prompt was built from the state's reports
    prompt = llm.structured.prompts[0]
    assert "market ok" in prompt
    assert "last opponent argument" in prompt
    assert "BBCA.JK" in prompt


def test_bear_researcher_mirror_config(fake_debate_llm):
    bear_argument = ARGUMENT.model_copy(update={"stance": "bear", "confidence": 0.6})
    node = create_researcher("bear", fake_debate_llm(bear_argument))
    new_state = node(_state())["investment_debate_state"]
    assert new_state["stage"] == "bull_turn"
    assert new_state["next_speaker"] == "Bull Researcher"
    assert new_state["bear_confidence"] == 0.6


def test_consensus_signal_propagates(fake_debate_llm):
    consensus = ARGUMENT.model_copy(update={"consensus_signal": True})
    node = create_researcher("bull", fake_debate_llm(consensus))
    new_state = node(_state())["investment_debate_state"]
    assert new_state["consensus_reached"] is True
    assert new_state["last_consensus_signal"] is True


def test_invalid_structured_output_uses_fallback(fake_debate_llm):
    node = create_researcher("bull", fake_debate_llm("not-a-schema-object"))
    new_state = node(_state())["investment_debate_state"]
    assert new_state["bull_confidence"] == 0.0
    assert "could not produce a fully validated argument" in new_state["current_response"]
    assert new_state["consensus_reached"] is False
