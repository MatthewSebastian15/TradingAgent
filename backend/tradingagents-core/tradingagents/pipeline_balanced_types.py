from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from tradingagents.agents.schemas import PortfolioRating
from tradingagents.dataflows.data_quality import DataQualityReport

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
    vendor_attempts: dict[str, list[str]] | None = None
    request_budget: dict[str, Any] | None = None
    financial_highlights: dict[str, Any] | None = None
    fundamental_analysis: dict[str, Any] | None = None


class AnalysisCancelledError(RuntimeError):
    """Raised when an API client cancels an in-progress analysis."""


class LLMBudget:
    """Thread-safe logical LLM call budget for the whole pipeline."""

    def __init__(self, limit: int) -> None:
        self.limit = max(0, int(limit))
        self.used = 0
        self.exhausted = False
        self.agents_skipped: list[str] = []
        self._lock = threading.Lock()

    def consume(self, agent_name: str) -> bool:
        with self._lock:
            if self.used >= self.limit:
                self.exhausted = True
                self.agents_skipped.append(agent_name)
                logger.warning(
                    "LLM budget exhausted before %s. Used %d/%d calls.",
                    agent_name,
                    self.used,
                    self.limit,
                )
                return False
            self.used += 1
            return True

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "used": self.used,
                "limit": self.limit,
                "budget_exhausted": self.exhausted,
                "agents_skipped": list(dict.fromkeys(self.agents_skipped)),
            }
