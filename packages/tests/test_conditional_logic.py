from types import SimpleNamespace

from tradingagents.graph.conditional_logic import ConditionalLogic


def _state_with_tool_calls(tool_calls):
    return {"messages": [SimpleNamespace(tool_calls=tool_calls)]}


def test_analyst_routing_on_tool_calls():
    logic = ConditionalLogic()
    with_tools = _state_with_tool_calls([{"name": "get_data"}])
    without_tools = _state_with_tool_calls([])
    assert logic.should_continue_market(with_tools) == "tools_market"
    assert logic.should_continue_market(without_tools) == "Msg Clear Market"
    assert logic.should_continue_social(with_tools) == "tools_social"
    assert logic.should_continue_news(without_tools) == "Msg Clear News"
    assert logic.should_continue_fundamentals(with_tools) == "tools_fundamentals"


def test_debate_stops_at_max_turns():
    logic = ConditionalLogic(max_debate_rounds=2)
    state = {"investment_debate_state": {"count": 4}}
    assert logic.should_continue_debate(state) == "Research Manager"


def test_debate_continues_below_min_turns():
    logic = ConditionalLogic(max_debate_rounds=5, debate_min_rounds=2)
    state = {
        "investment_debate_state": {
            "count": 2,
            "bull_confidence": 0.95,
            "bear_confidence": 0.1,
            "next_speaker": "Bear Researcher",
        }
    }
    assert logic.should_continue_debate(state) == "Bear Researcher"


def test_debate_adaptive_stop_on_confidence_gap():
    logic = ConditionalLogic(max_debate_rounds=5, debate_min_rounds=2)
    state = {
        "investment_debate_state": {"count": 4, "bull_confidence": 0.9, "bear_confidence": 0.3}
    }
    assert logic.should_continue_debate(state) == "Research Manager"


def test_debate_adaptive_disabled_runs_to_max():
    logic = ConditionalLogic(max_debate_rounds=5, adaptive_debate_enabled=False)
    state = {
        "investment_debate_state": {"count": 8, "bull_confidence": 0.99, "bear_confidence": 0.0}
    }
    assert logic.should_continue_debate(state) == "Bull Researcher"  # default speaker


def test_risk_stops_at_max_turns():
    logic = ConditionalLogic(max_risk_discuss_rounds=2)
    state = {"risk_debate_state": {"count": 6}}
    assert logic.should_continue_risk_analysis(state) == "Portfolio Manager"


def test_risk_consensus_stop_requires_confidence():
    logic = ConditionalLogic(max_risk_discuss_rounds=5, risk_min_rounds=2)
    confident = {
        "risk_debate_state": {
            "count": 6,
            "consensus_reached": True,
            "aggressive_confidence": 0.8,
            "conservative_confidence": 0.8,
            "neutral_confidence": 0.8,
        }
    }
    assert logic.should_continue_risk_analysis(confident) == "Portfolio Manager"
    unconfident = {
        "risk_debate_state": {
            "count": 6,
            "consensus_reached": True,
            "aggressive_confidence": 0.3,
            "conservative_confidence": 0.3,
            "neutral_confidence": 0.3,
            "next_speaker": "Neutral Analyst",
        }
    }
    assert logic.should_continue_risk_analysis(unconfident) == "Neutral Analyst"
