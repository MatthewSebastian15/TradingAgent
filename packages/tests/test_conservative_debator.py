from tradingagents.agents.risk_mgmt.conservative_debator import create_conservative_debator
from tradingagents.agents.schemas import DebateArgument

ARGUMENT = DebateArgument(
    stance="conservative",
    thesis="Margin of safety is insufficient to justify the proposed position size.",
    evidence=["Valuation sits above the base fair value.", "Drawdown history exceeds 20 percent."],
    counterargument="Aggressive upside case relies on catalysts that may not materialize.",
    risk_flags=["Liquidity risk"],
    confidence=0.65,
    consensus_signal=True,
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
            "conservative_history": "",
            "current_aggressive_response": "aggressive said X",
            "current_conservative_response": "",
            "current_neutral_response": "",
            "count": 2,
        },
    }


def test_conservative_node_updates_state(fake_debate_llm):
    node = create_conservative_debator(fake_debate_llm(ARGUMENT))
    new_state = node(_state())["risk_debate_state"]

    assert new_state["stage"] == "neutral_turn"
    assert new_state["next_speaker"] == "Neutral Analyst"
    assert new_state["latest_speaker"] == "Conservative"
    assert new_state["count"] == 3
    assert new_state["conservative_confidence"] == 0.65
    assert "Conservative Analyst:" in new_state["current_conservative_response"]
    assert new_state["consensus_reached"] is True  # consensus signal propagated


def test_invalid_output_uses_low_confidence_fallback(fake_debate_llm):
    node = create_conservative_debator(fake_debate_llm(RuntimeError("provider down")))
    new_state = node(_state())["risk_debate_state"]
    assert new_state["conservative_confidence"] == 0.0
    assert (
        "could not produce a fully validated risk argument"
        in (new_state["current_conservative_response"])
    )
