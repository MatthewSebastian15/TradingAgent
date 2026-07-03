from tradingagents.agents.utils.agent_states import (
    AgentState,
    InvestDebateState,
    RiskDebateState,
)


def test_invest_debate_state_contract():
    assert set(InvestDebateState.__annotations__) == {
        "stage",
        "next_speaker",
        "consensus_reached",
        "last_consensus_signal",
        "bull_confidence",
        "bear_confidence",
        "bull_history",
        "bear_history",
        "history",
        "current_response",
        "judge_decision",
        "count",
    }


def test_risk_debate_state_contract():
    keys = set(RiskDebateState.__annotations__)
    assert {
        "stage",
        "next_speaker",
        "consensus_reached",
        "aggressive_confidence",
        "conservative_confidence",
        "neutral_confidence",
        "aggressive_history",
        "conservative_history",
        "neutral_history",
        "latest_speaker",
        "current_aggressive_response",
        "current_conservative_response",
        "current_neutral_response",
        "judge_decision",
        "count",
    } <= keys


def test_agent_state_report_fields_present():
    keys = set(AgentState.__annotations__)
    assert {
        "company_of_interest",
        "trade_date",
        "market_report",
        "sentiment_report",
        "news_report",
        "fundamentals_report",
        "investment_debate_state",
        "investment_plan",
        "trader_investment_plan",
        "risk_debate_state",
        "final_trade_decision",
        "past_context",
        "portfolio_decision",
    } <= keys


def test_states_usable_as_plain_dicts():
    debate: InvestDebateState = {
        "stage": "bull_turn",
        "next_speaker": "Bull Researcher",
        "consensus_reached": False,
        "last_consensus_signal": False,
        "bull_confidence": 0.0,
        "bear_confidence": 0.0,
        "bull_history": "",
        "bear_history": "",
        "history": "",
        "current_response": "",
        "judge_decision": "",
        "count": 0,
    }
    debate["count"] += 1
    assert debate["count"] == 1
