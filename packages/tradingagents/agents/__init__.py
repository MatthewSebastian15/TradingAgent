"""Lazy exports for graph agent factories and shared agent contracts.

Importing ``tradingagents.agents.schemas`` should not eagerly import every
LangChain/LangGraph-backed agent. Unit tests and lightweight modules often need
only the Pydantic schemas, and forcing all optional runtime dependencies to load
at package import time makes those tests pointlessly fragile. The graph builder
can still import the same public names; they are resolved only when requested.
"""

from __future__ import annotations

from importlib import import_module
from typing import Any

_EXPORTS = {
    "AgentCallable": ("tradingagents.agents.base", "AgentCallable"),
    "AgentMetadata": ("tradingagents.agents.base", "AgentMetadata"),
    "AgentOutput": ("tradingagents.agents.base", "AgentOutput"),
    "AgentStateLike": ("tradingagents.agents.base", "AgentStateLike"),
    "BaseAgentNode": ("tradingagents.agents.base", "BaseAgentNode"),
    "StructuredOutputAgentNode": ("tradingagents.agents.base", "StructuredOutputAgentNode"),
    "ToolCallingAgentNode": ("tradingagents.agents.base", "ToolCallingAgentNode"),
    "AgentState": ("tradingagents.agents.utils.agent_states", "AgentState"),
    "InvestDebateState": ("tradingagents.agents.utils.agent_states", "InvestDebateState"),
    "RiskDebateState": ("tradingagents.agents.utils.agent_states", "RiskDebateState"),
    "create_msg_delete": ("tradingagents.agents.utils.agent_utils", "create_msg_delete"),
    "create_bear_researcher": (
        "tradingagents.agents.researchers.bear_researcher",
        "create_bear_researcher",
    ),
    "create_bull_researcher": (
        "tradingagents.agents.researchers.bull_researcher",
        "create_bull_researcher",
    ),
    "create_research_manager": (
        "tradingagents.agents.managers.research_manager",
        "create_research_manager",
    ),
    "create_fundamentals_analyst": (
        "tradingagents.agents.analysts.fundamentals_analyst",
        "create_fundamentals_analyst",
    ),
    "create_market_analyst": (
        "tradingagents.agents.analysts.market_analyst",
        "create_market_analyst",
    ),
    "create_neutral_debator": (
        "tradingagents.agents.risk_mgmt.neutral_debator",
        "create_neutral_debator",
    ),
    "create_news_analyst": ("tradingagents.agents.analysts.news_analyst", "create_news_analyst"),
    "create_aggressive_debator": (
        "tradingagents.agents.risk_mgmt.aggressive_debator",
        "create_aggressive_debator",
    ),
    "create_portfolio_manager": (
        "tradingagents.agents.managers.portfolio_manager",
        "create_portfolio_manager",
    ),
    "create_conservative_debator": (
        "tradingagents.agents.risk_mgmt.conservative_debator",
        "create_conservative_debator",
    ),
    "create_social_media_analyst": (
        "tradingagents.agents.analysts.social_media_analyst",
        "create_social_media_analyst",
    ),
    "create_trader": ("tradingagents.agents.trader.trader", "create_trader"),
}

__all__ = list(_EXPORTS)


def __getattr__(name: str) -> Any:
    try:
        module_name, attribute = _EXPORTS[name]
    except KeyError as exc:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc
    value = getattr(import_module(module_name), attribute)
    globals()[name] = value
    return value
