from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from tradingagents.agents.schemas import PortfolioRating
from tradingagents.dataflows.data_quality import DataQualityReport
from tradingagents.dataflows.errors import ErrorCode

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], None]


class AnalystReport(BaseModel):
    title: str = Field(description="Short title for the report.")
    summary: str = Field(description="Plain-English summary of the evidence and conclusion.")
    key_points: list[str] = Field(default_factory=list, max_length=8)
    risks: list[str] = Field(default_factory=list, max_length=6)
    confidence: float = Field(ge=0.0, le=1.0)


class ResearchPlanLite(BaseModel):
    recommendation: PortfolioRating
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    strategic_actions: str


class RiskCommitteeReport(BaseModel):
    overall_risk_level: str = Field(description="Low, Medium, High, or Very High.")
    aggressive_view: str
    neutral_view: str
    conservative_view: str
    key_risks: list[str] = Field(default_factory=list, max_length=8)
    mitigation_plan: str
    confidence: float = Field(ge=0.0, le=1.0)


@dataclass
class CollectedData:
    ticker: str
    trade_date: str
    time_horizon_months: int
    price_data: str
    technical_indicators: str
    fundamentals: str
    balance_sheet: str
    cashflow: str
    income_statement: str
    company_news: str
    global_news: str
    insider_transactions: str
    data_quality: DataQualityReport
    last_close_price: float | None
    news_sentiment: str = ""
    social_sentiment: str = ""
    event_risk: str = ""
    recommendation_trends: str = ""
    last_close_price_as_of: str | None = None
    last_close_price_source: str | None = None
    last_close_price_is_fallback: bool = False
    company_profile: dict[str, Any] | None = None
    price_chart: dict[str, Any] | None = None
    price_performance: dict[str, Any] | None = None
    technical_entry: dict[str, Any] | None = None
    news_context: dict[str, Any] | None = None
    related_news: dict[str, Any] | None = None
    news_impact: dict[str, Any] | None = None
    catalyst_tracker: dict[str, Any] | None = None
    analyst_consensus: dict[str, Any] | None = None
    data_sources: dict[str, str] | None = None
    data_limitations: list[str] | None = None
    field_sources: dict[str, Any] | None = None
    validation_summary: dict[str, Any] | None = None
    warnings: list[str] | None = None
    vendor_attempts: dict[str, list[str]] | None = None
    request_budget: dict[str, Any] | None = None
    data_freshness: dict[str, Any] | None = None
    data_completeness: dict[str, Any] | None = None
    fundamental_gap_report: dict[str, Any] | None = None
    normalized_period_rows: list[dict[str, Any]] | None = None
    derived_fundamentals: list[dict[str, Any]] | None = None
    financial_highlights: dict[str, Any] | None = None
    fundamental_analysis: dict[str, Any] | None = None
    prompt_context: dict[str, Any] | None = None
    safety_prompt_context: Any | None = None


class AnalysisCancelledError(RuntimeError):
    """Raised when an API client cancels an in-progress analysis."""


class LLMBudget:
    """Thread-safe logical LLM call budget for the whole pipeline."""

    def __init__(self, limit: int) -> None:
        self.limit = max(0, int(limit))
        self.used = 0
        self.exhausted = False
        self.agent_calls: dict[str, int] = {}
        self.agents_skipped: list[str] = []
        self.warnings: list[dict[str, str]] = []
        self._lock = threading.Lock()

    def consume(self, agent_name: str) -> bool:
        with self._lock:
            if self.used >= self.limit:
                self.exhausted = True
                self.agents_skipped.append(agent_name)
                self.warnings.append(
                    {
                        "code": ErrorCode.LLM_BUDGET_EXCEEDED,
                        "message": f"LLM budget exceeded before {agent_name}. Agent skipped.",
                    }
                )
                logger.warning(
                    "LLM budget exhausted before %s. Used %d/%d calls.",
                    agent_name,
                    self.used,
                    self.limit,
                )
                return False
            self.used += 1
            self.agent_calls[agent_name] = self.agent_calls.get(agent_name, 0) + 1
            return True

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "used": self.used,
                "limit": self.limit,
                "max": self.limit,
                "budget_exhausted": self.exhausted,
                "agents": {agent: {"used": used} for agent, used in self.agent_calls.items()},
                "agents_skipped": list(dict.fromkeys(self.agents_skipped)),
                "warnings": list(self.warnings),
            }

    def record_warning(self, code: str, message: str) -> None:
        with self._lock:
            self.warnings.append({"code": str(code), "message": str(message)})
