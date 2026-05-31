"""Pydantic response schemas for the public FastAPI contract.

The analysis pipeline intentionally returns a rich, evolving payload. These
schemas lock the stable envelope while allowing additional result fields, so
OpenAPI is useful without forcing every model-generated field into a brittle
schema on day one.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

AnalysisStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class ApiSchema(BaseModel):
    model_config = ConfigDict(extra="allow")


class ErrorEnvelope(ApiSchema):
    code: str | None = None
    message: str | None = None
    details: dict[str, Any] | None = None


class FinancialHighlightPeriod(ApiSchema):
    key: str
    label: str
    type: Literal["annual", "quarter"]
    year: int
    quarter: int | None = None


class FinancialHighlightCell(ApiSchema):
    value: float | None = None
    display: str
    status: Literal["reported", "calculated", "estimated", "unavailable"]
    source_vendor: str | None = None
    source_field: str | None = None
    formula: str | None = None


class FinancialHighlightRow(ApiSchema):
    key: str
    label: str
    unit: str
    values: dict[str, FinancialHighlightCell]


class FinancialHighlightsResponse(ApiSchema):
    title: str
    currency: str | None = None
    scale: str
    analysis_date: str
    period_logic: str = "analysis_quarter"
    periods: list[FinancialHighlightPeriod]
    rows: list[FinancialHighlightRow]
    notes: list[str] = Field(default_factory=list)
    data_quality: dict[str, Any] = Field(default_factory=dict)


class CompanyExecutive(ApiSchema):
    name: str
    title: str | None = None


class CompanyProfile(ApiSchema):
    available: bool = False
    ticker: str | None = None
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    full_time_employees: int | None = None
    description: str | None = None
    executives: list[CompanyExecutive] = Field(default_factory=list)
    warning: str | None = None


class PriceChartPoint(ApiSchema):
    date: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None


class PriceChart(ApiSchema):
    available: bool = False
    source: str | None = None
    ticker: str | None = None
    trade_date: str | None = None
    window_label: str | None = None
    lookback_days: int | None = None
    points: list[PriceChartPoint] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    warning: str | None = None


class AnalysisResponse(ApiSchema):
    request_id: str
    ticker: str
    market: str | None = None
    trade_date: str
    analysis_created_at: str | None = None
    analysis_depth: str | None = None
    response_detail: str | None = None
    has_existing_position: bool | None = False
    position_quantity: float | None = None
    average_entry_price: float | None = None
    agents_used: list[str] = Field(default_factory=list)
    time_horizon_months: int | None = None
    financial_highlights: FinancialHighlightsResponse | None = None
    company_profile: CompanyProfile | dict[str, Any] | None = None
    price_chart: PriceChart | dict[str, Any] | None = None


class AnalysisJobCreateResponse(ApiSchema):
    job_id: str
    request_id: str
    status: AnalysisStatus
    events_url: str


class AnalysisJobSummaryResponse(ApiSchema):
    job_id: str
    request_id: str
    status: AnalysisStatus
    created_at: float
    updated_at: float
    payload: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


class AnalysisLookupResponse(ApiSchema):
    request_id: str


class TickerValidationResponse(ApiSchema):
    ticker: str
    trade_date: str
    valid: bool
    message: str


class MarketQuote(ApiSchema):
    sym: str
    chg: str
    pos: bool
    price: float | None = None
    error: bool = False


class MarketQuotesResponse(ApiSchema):
    quotes: list[MarketQuote] = Field(default_factory=list)


class ApiStatusResponse(ApiSchema):
    provider: str
    quick_model: str
    deep_model: str
    analysis_mode: str
    default_analysis_depth: str
    limits: dict[str, Any] = Field(default_factory=dict)
    result_cache: dict[str, Any] = Field(default_factory=dict)
    in_flight: dict[str, Any] = Field(default_factory=dict)
    jobs: dict[str, Any] = Field(default_factory=dict)
    tool_cache: dict[str, Any] = Field(default_factory=dict)
    circuits: dict[str, Any] = Field(default_factory=dict)
    timeout_workers: dict[str, Any] = Field(default_factory=dict)
