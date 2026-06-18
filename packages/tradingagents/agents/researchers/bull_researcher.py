from __future__ import annotations

from tradingagents.agents.researchers.researcher_factory import create_researcher


def create_bull_researcher(llm):
    return create_researcher("bull", llm)
