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
    format_type: Literal["currency_scaled", "per_share", "percent", "ratio", "number"] | None = None
    section_key: str | None = None
    values: dict[str, FinancialHighlightCell]


class FinancialHighlightSection(ApiSchema):
    key: str
    title: str
    description: str | None = None
    rows: list[FinancialHighlightRow] = Field(default_factory=list)


class FinancialPointInTimeMetric(ApiSchema):
    key: str
    label: str
    value: float | None = None
    display: str
    unit: str
    as_of: str | None = None
    status: Literal["reported", "calculated", "estimated", "unavailable"]
    source_vendor: str | None = None
    source_field: str | None = None


class FinancialHighlightsResponse(ApiSchema):
    title: str
    currency: str | None = None
    scale: str
    currency_label: str | None = None
    scale_label: str | None = None
    unit_note: str | None = None
    analysis_date: str
    period_logic: str = "analysis_quarter"
    periods: list[FinancialHighlightPeriod]
    point_in_time: list[FinancialPointInTimeMetric] = Field(default_factory=list)
    sections: list[FinancialHighlightSection] = Field(default_factory=list)
    rows: list[FinancialHighlightRow]
    notes: list[str] = Field(default_factory=list)
    data_quality: dict[str, Any] = Field(default_factory=dict)


class CompanyExecutive(ApiSchema):
    name: str
    title: str | None = None


class CompanyProfile(ApiSchema):
    available: bool = False
    ticker: str | None = None
    company_name: str | None = None
    exchange: str | None = None
    currency: str | None = None
    country: str | None = None
    sector: str | None = None
    industry: str | None = None
    business_summary: str | None = None
    website: str | None = None
    market_cap: float | None = None
    shares_outstanding: float | None = None
    current_price: float | None = None
    fiscal_year_end: str | None = None
    employee_count: int | None = None
    officers: list[CompanyExecutive] = Field(default_factory=list)
    data_quality: dict[str, Any] = Field(default_factory=dict)
    warning: str | None = None


class AnalysisOverviewActionPlan(ApiSchema):
    current_price: float | None = None
    entry: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    max_drawdown: str | None = None
    volatility: str | None = None
    position_action: str | None = None
    position_size_hint: str | None = None
    risk_reward_ratio: float | None = None
    risk_reward_display: str | None = None


class AnalysisOverviewRiskSummary(ApiSchema):
    overall_risk: str
    short_reason: str


class AnalysisOverview(ApiSchema):
    recommendation: str
    confidence: Literal["High", "Medium", "Low"]
    executive_summary: str | None = None
    investment_thesis: str | None = None
    key_reasons: list[str] = Field(default_factory=list)
    key_reasons_paragraph: str | None = None
    action_plan: AnalysisOverviewActionPlan
    risk_summary: AnalysisOverviewRiskSummary


class PriceChartPoint(ApiSchema):
    date: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    adjusted_close: float | None = None
    volume: int | None = None


class PricePerformance(ApiSchema):
    period_return_percent: float | None = None
    period_high: float | None = None
    period_low: float | None = None
    max_drawdown_percent: float | None = None
    average_volume: float | None = None
    latest_volume: float | None = None
    latest_close: float | None = None
    volume_trend: str | None = None
    performance_label: str | None = None


class PriceChart(ApiSchema):
    available: bool = False
    source: str | None = None
    ticker: str | None = None
    trade_date: str | None = None
    currency: str | None = None
    window: str | None = None
    window_label: str | None = None
    lookback_days: int | None = None
    points: list[PriceChartPoint] = Field(default_factory=list)
    data: list[PriceChartPoint] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    summary: PricePerformance | dict[str, Any] | None = None
    data_quality: dict[str, Any] = Field(default_factory=dict)
    warning: str | None = None


class TechnicalEntry(ApiSchema):
    available: bool = False
    entry_quality: str | None = None
    trend: str | None = None
    rsi: float | None = None
    rsi_signal: str | None = None
    macd: float | None = None
    macd_signal_value: float | None = None
    macd_signal: str | None = None
    atr: float | None = None
    sma_20: float | None = None
    sma_50: float | None = None
    sma_200: float | None = None
    support: float | None = None
    resistance: float | None = None
    volume_trend: str | None = None
    reasons: list[str] = Field(default_factory=list)
    data_quality: dict[str, Any] = Field(default_factory=dict)


class RelatedNewsItem(ApiSchema):
    title: str
    publisher: str | None = None
    published_at: str | None = None
    url: str | None = None
    normalized_url: str | None = None
    summary: str | None = None
    source: str | None = None
    event_type: str | None = None
    related_ticker: str | None = None
    relevance_reason: str | None = None


class RelatedNews(ApiSchema):
    available: bool = False
    ticker: str | None = None
    trade_date: str | None = None
    lookback_days: int | None = None
    source: str | None = None
    summary: str | None = None
    items: list[RelatedNewsItem] = Field(default_factory=list)
    warning: str | None = None


class NewsEntity(ApiSchema):
    symbol: str | None = None
    name: str | None = None
    exchange: str | None = None
    country: str | None = None
    entity_type: str | None = None
    industry: str | None = None
    match_score: float | None = None
    sentiment_score: float | None = None


class NewsArticle(ApiSchema):
    provider: str
    ticker: str
    title: str
    url: str
    summary: str | None = None
    image_url: str | None = None
    source: str | None = None
    source_domain: str | None = None
    published_at: str | None = None
    sentiment_label: str | None = None
    sentiment_score: float | None = None
    relevance_score: float = 0
    relevance_reasons: list[str] = Field(default_factory=list)
    entities: list[NewsEntity] = Field(default_factory=list)


class NewsResponse(ApiSchema):
    enabled: bool = True
    ticker: str
    company_name: str | None = None
    window_days: int = 30
    providers_used: list[str] = Field(default_factory=list)
    provider_status: dict[str, str] = Field(default_factory=dict)
    provider_health: dict[str, Any] = Field(default_factory=dict)
    articles_found: int = 0
    articles_used_in_prompt: int = 0
    average_sentiment: str | None = None
    articles: list[NewsArticle] = Field(default_factory=list)
    empty_reason: str | None = None
    cache: dict[str, Any] = Field(default_factory=dict)


class NewsImpactItem(ApiSchema):
    title: str
    source: str | None = None
    published_at: str | None = None
    sentiment: str | None = None
    impact: str | None = None
    impact_score: float | None = None
    relevance_score: float | None = None
    recency_score: float | None = None
    materiality_score: float | None = None
    materiality_category: str | None = None
    summary: str | None = None
    url: str | None = None
    normalized_url: str | None = None


class NewsImpact(ApiSchema):
    available: bool = False
    overall_sentiment: str | None = None
    sentiment_score: float | None = None
    high_impact_news: list[NewsImpactItem] = Field(default_factory=list)
    full_news_list: list[NewsImpactItem] = Field(default_factory=list)
    news_count: int = 0
    deduplicated_count: int = 0
    data_quality: dict[str, Any] = Field(default_factory=dict)


class CatalystItem(ApiSchema):
    type: str | None = None
    label: str | None = None
    impact: str | None = None
    source: str | None = None
    date: str | None = None
    related_news_title: str | None = None


class UpcomingEvent(ApiSchema):
    type: str | None = None
    label: str | None = None
    date: str | None = None
    source: str | None = None
    risk_level: str | None = None


class CatalystTracker(ApiSchema):
    positive_catalysts: list[CatalystItem] = Field(default_factory=list)
    negative_catalysts: list[CatalystItem] = Field(default_factory=list)
    upcoming_events: list[UpcomingEvent] = Field(default_factory=list)
    summary: dict[str, Any] = Field(default_factory=dict)


class AnalystConsensus(ApiSchema):
    available: bool = False
    period: str | None = None
    strong_buy: int = 0
    buy: int = 0
    hold: int = 0
    sell: int = 0
    strong_sell: int = 0
    total: int = 0
    consensus_label: str | None = None
    trend: str | None = None
    data_quality: dict[str, Any] = Field(default_factory=dict)


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
    analysis_overview: AnalysisOverview | dict[str, Any] | None = None
    key_reasons_paragraph: str | None = None
    financial_highlights: FinancialHighlightsResponse | None = None
    financial_trends: dict[str, Any] | None = None
    valuation_multiples: dict[str, Any] | None = None
    fair_value_range: dict[str, Any] | None = None
    scenario_analysis: dict[str, Any] | None = None
    quality_of_earnings: dict[str, Any] | None = None
    balance_sheet_risk: dict[str, Any] | None = None
    dividend_quality: dict[str, Any] | None = None
    peer_comparison: dict[str, Any] | None = None
    company_profile: CompanyProfile | dict[str, Any] | None = None
    price_chart: PriceChart | dict[str, Any] | None = None
    price_performance: PricePerformance | dict[str, Any] | None = None
    technical_entry: TechnicalEntry | dict[str, Any] | None = None
    related_news: RelatedNews | dict[str, Any] | None = None
    news_impact: NewsImpact | dict[str, Any] | None = None
    catalyst_tracker: CatalystTracker | dict[str, Any] | None = None
    analyst_consensus: AnalystConsensus | dict[str, Any] | None = None
    news: NewsResponse | dict[str, Any] | None = None
    news_context: NewsResponse | dict[str, Any] | None = None
    risk_data_quality: dict[str, Any] | None = None


class AnalysisJobCreateResponse(ApiSchema):
    job_id: str
    request_id: str
    status: AnalysisStatus
    events_url: str


class OwnerSessionResponse(ApiSchema):
    owner_token: str
    expires_at: int


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
    llm_cache: dict[str, Any] = Field(default_factory=dict)
    circuits: dict[str, Any] = Field(default_factory=dict)
    timeout_workers: dict[str, Any] = Field(default_factory=dict)
