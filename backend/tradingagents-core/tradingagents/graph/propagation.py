# TradingAgents/graph/propagation.py

from typing import Dict, Any, List, Optional
from tradingagents.agents.utils.agent_states import (
    InvestDebateState,
    RiskDebateState,
)


class Propagator:
    """Handles state initialization and propagation through the graph."""

    def __init__(self, max_recur_limit=100):
        self.max_recur_limit = max_recur_limit

    def create_initial_state(
        self, company_name: str, trade_date: str, past_context: str = ""
    ) -> Dict[str, Any]:
        return {
            "messages": [("human", company_name)],
            "company_of_interest": company_name,
            "trade_date": str(trade_date),
            "past_context": past_context,
            "investment_debate_state": InvestDebateState(
                {
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
            ),
            "risk_debate_state": RiskDebateState(
                {
                    "stage": "aggressive_turn",
                    "next_speaker": "Aggressive Analyst",
                    "consensus_reached": False,
                    "last_consensus_signal": False,
                    "aggressive_confidence": 0.0,
                    "conservative_confidence": 0.0,
                    "neutral_confidence": 0.0,
                    "aggressive_history": "",
                    "conservative_history": "",
                    "neutral_history": "",
                    "history": "",
                    "latest_speaker": "",
                    "current_aggressive_response": "",
                    "current_conservative_response": "",
                    "current_neutral_response": "",
                    "judge_decision": "",
                    "count": 0,
                }
            ),
            "market_report": "",
            "fundamentals_report": "",
            "sentiment_report": "",
            "news_report": "",
            "portfolio_decision": None,
        }

    def get_graph_args(self, callbacks: Optional[List] = None) -> Dict[str, Any]:
        config = {"recursion_limit": self.max_recur_limit}
        if callbacks:
            config["callbacks"] = callbacks
        return {
            "stream_mode": "values",
            "config": config,
        }
