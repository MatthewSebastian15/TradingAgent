from __future__ import annotations

from enum import StrEnum


class SseEvent(StrEnum):
    PROGRESS = "progress"
    RESULT = "result"
    ERROR = "error"
    HEARTBEAT = "heartbeat"


class PipelineAgent(StrEnum):
    DATA_COLLECTION = "data_collection"
    MARKET_ANALYST = "market_analyst"
    NEWS_ANALYST = "news_analyst"
    FUNDAMENTALS = "fundamentals"
    BULL_RESEARCHER = "bull_researcher"
    BEAR_RESEARCHER = "bear_researcher"
    RESEARCH_MANAGER = "research_manager"
    TRADER = "trader"
    RISK_ANALYSTS = "risk_analysts"
    PORTFOLIO_MANAGER = "portfolio_manager"
    CACHE = "cache"
    PIPELINE = "pipeline"


class PipelineStatus(StrEnum):
    STARTED = "started"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ERROR = "error"
    SKIPPED = "skipped"


UI_AGENT_IDS = tuple(agent.value for agent in PipelineAgent)
UI_EVENT_TYPES = tuple(event.value for event in SseEvent)
UI_PIPELINE_STATUSES = tuple(status.value for status in PipelineStatus)
