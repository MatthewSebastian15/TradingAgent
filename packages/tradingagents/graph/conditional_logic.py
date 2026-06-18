from __future__ import annotations

from tradingagents.agents.utils.agent_states import AgentState


class ConditionalLogic:
    """Conditional graph routing based on explicit state, not text parsing."""

    def __init__(
        self,
        max_debate_rounds: int = 3,
        max_risk_discuss_rounds: int = 3,
        adaptive_debate_enabled: bool = True,
        debate_min_rounds: int = 2,
        debate_confidence_gap: float = 0.18,
        debate_consensus_threshold: float = 0.72,
        risk_min_rounds: int = 2,
        risk_consensus_threshold: float = 0.72,
    ):
        self.max_debate_rounds = max_debate_rounds
        self.max_risk_discuss_rounds = max_risk_discuss_rounds
        self.adaptive_debate_enabled = adaptive_debate_enabled

        self.debate_min_turns = max(1, debate_min_rounds) * 2
        self.risk_min_turns = max(1, risk_min_rounds) * 3

        self.debate_confidence_gap = debate_confidence_gap
        self.debate_consensus_threshold = debate_consensus_threshold
        self.risk_consensus_threshold = risk_consensus_threshold

    def should_continue_market(self, state: AgentState):
        last_message = state["messages"][-1]
        return "tools_market" if last_message.tool_calls else "Msg Clear Market"

    def should_continue_social(self, state: AgentState):
        last_message = state["messages"][-1]
        return "tools_social" if last_message.tool_calls else "Msg Clear Social"

    def should_continue_news(self, state: AgentState):
        last_message = state["messages"][-1]
        return "tools_news" if last_message.tool_calls else "Msg Clear News"

    def should_continue_fundamentals(self, state: AgentState):
        last_message = state["messages"][-1]
        return "tools_fundamentals" if last_message.tool_calls else "Msg Clear Fundamentals"

    def _investment_can_stop(self, debate_state: dict) -> bool:
        count = int(debate_state.get("count", 0))
        max_turns = 2 * self.max_debate_rounds

        if count >= max_turns:
            return True

        if not self.adaptive_debate_enabled or count < self.debate_min_turns:
            return False

        bull_conf = float(debate_state.get("bull_confidence", 0.0) or 0.0)
        bear_conf = float(debate_state.get("bear_confidence", 0.0) or 0.0)

        confidence_gap = abs(bull_conf - bear_conf)
        strong_side = max(bull_conf, bear_conf) >= self.debate_consensus_threshold
        consensus = bool(debate_state.get("consensus_reached", False))

        return consensus or (strong_side and confidence_gap >= self.debate_confidence_gap)

    def should_continue_debate(self, state: AgentState) -> str:
        debate_state = state["investment_debate_state"]

        if self._investment_can_stop(debate_state):
            return "Research Manager"

        return debate_state.get("next_speaker") or "Bull Researcher"

    def _risk_can_stop(self, risk_state: dict) -> bool:
        count = int(risk_state.get("count", 0))
        max_turns = 3 * self.max_risk_discuss_rounds

        if count >= max_turns:
            return True

        if not self.adaptive_debate_enabled or count < self.risk_min_turns:
            return False

        scores = [
            float(risk_state.get("aggressive_confidence", 0.0) or 0.0),
            float(risk_state.get("conservative_confidence", 0.0) or 0.0),
            float(risk_state.get("neutral_confidence", 0.0) or 0.0),
        ]

        avg_confidence = sum(scores) / len(scores)
        consensus = bool(risk_state.get("consensus_reached", False))

        return consensus and avg_confidence >= self.risk_consensus_threshold

    def should_continue_risk_analysis(self, state: AgentState) -> str:
        risk_state = state["risk_debate_state"]

        if self._risk_can_stop(risk_state):
            return "Portfolio Manager"

        return risk_state.get("next_speaker") or "Aggressive Analyst"
