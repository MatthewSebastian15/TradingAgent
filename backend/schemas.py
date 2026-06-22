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
    type: Literal["annual", "quarter", "quarterly", "ttm"]
    year: int
    quarter: int | None = None
    display_period: str | None = None
    sort_key: str | None = None


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
    shares_out: float | None = None
    insider_percent: float | None = None
    insider_pct: float | None = None
    institution_percent: float | None = None
    institution_pct: float | None = None
    public_percent: float | None = None
    public_pct: float | None = None
    short_ratio: float | None = None
    shares_ownership: dict[str, Any] | None = None
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
    disclaimer: str | None = None
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
    requested_trade_date: str | None = None
    effective_trade_date: str | None = None
    price_as_of_date: str | None = None
    last_trade_date: str | None = None
    last_available_trade_date: str | None = None
    fallback_to_last_trade: bool = False
    start_date: str | None = None
    end_date: str | None = None
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
    provider: str | None = None
    provider_article_id: str | None = None
    ticker: str | None = None
    company_name: str | None = None
    title: str | None = None
    url: str | None = None
    summary: str | None = None
    image_url: str | None = None
    source: str | None = None
    source_domain: str | None = None
    category: str | None = None
    feed_id: str | None = None
    feed_tier: int | None = None
    published_at: str | None = None
    sentiment_label: str | None = None
    sentiment_score: float | None = None
    relevance_score: float = 0
    relevance_category: str | None = None
    relevance_reasons: list[str] = Field(default_factory=list)
    entity_match: str | None = None
    matched_terms: list[str] = Field(default_factory=list)
    bucket: str | None = None
    market_context_only: bool | None = None
    provider_trust_score: float | None = None
    final_rank_score: float | None = None
    decision_filter_reason: str | None = None
    entities: list[NewsEntity] = Field(default_factory=list)


class NewsResponse(ApiSchema):
    enabled: bool | None = None
    mode: str | None = None
    ticker: str | None = None
    company_name: str | None = None
    aliases: list[str] | None = None
    window_days: int | None = None
    limit: int | None = None
    last_updated: str | None = None
    providers_used: list[str] = Field(default_factory=list)
    provider_status: dict[str, str] | None = None
    provider_health: dict[str, Any] | None = None
    articles_found: int | None = None
    articles_used_in_prompt: int | None = None
    dedup_removed_count: int | None = None
    duplicate_removed_count: int | None = None
    average_sentiment: str | None = None
    articles: list[NewsArticle] | None = None
    decision_company_news: list[NewsArticle] | None = None
    market_context_news: list[NewsArticle] | None = None
    prompt_articles: list[NewsArticle] | None = None
    strict_news_filter: dict[str, Any] | None = None
    limitations: list[str] | None = None
    empty_reason: str | None = None
    cache: dict[str, Any] | None = None


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
    normalized_period_rows: list[dict[str, Any]] = Field(default_factory=list)
    derived_fundamentals: list[dict[str, Any]] = Field(default_factory=list)
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
    volume: float | int | None = None
    error: bool = False


class MarketQuotesResponse(ApiSchema):
    quotes: list[MarketQuote] = Field(default_factory=list)


class MarketOverviewRequest(ApiSchema):
    symbols: list[str]


class MarketOverviewItem(ApiSchema):
    symbol: str
    label: str
    last: float | None = None
    change: float | None = None
    change_percent: float | None = None
    currency: str | None = None
    sparkline: list[float] = Field(default_factory=list)
    status: Literal["ok", "error", "unavailable"] = "unavailable"
    updated_at: str | None = None
    reason: str | None = None


class MarketOverviewCacheInfo(ApiSchema):
    hit: bool = False
    ttl_seconds: int | None = None
    force_refresh: bool = False


class MarketOverviewResponse(ApiSchema):
    items: list[MarketOverviewItem] = Field(default_factory=list)
    message: str | None = None
    source: str = "yfinance"
    last_updated: str | None = None
    cache: MarketOverviewCacheInfo = Field(default_factory=MarketOverviewCacheInfo)


class MarketMoverItem(ApiSchema):
    symbol: str
    name: str
    last: float
    change: float
    change_percent: float
    volume: int | None = None
    trend: list[float] = Field(default_factory=list)


class MarketMoversResponse(ApiSchema):
    country: str
    exchange: str
    limit: int
    updated_at: str
    gainers: list[MarketMoverItem] = Field(default_factory=list)
    losers: list[MarketMoverItem] = Field(default_factory=list)
    source: str = "yfinance"
    message: str | None = None


class MarketPresetItem(ApiSchema):
    label: str
    symbol: str


class MarketExchangePreset(ApiSchema):
    country: str
    country_code: str
    exchange: str
    suffix: str = ""


class MarketPresetsResponse(ApiSchema):
    categories: dict[str, list[MarketPresetItem]]
    exchanges: list[MarketExchangePreset] = Field(default_factory=list)


class SymbolValidationResponse(ApiSchema):
    symbol: str
    valid: bool
    label: str | None = None
    source: str | None = None
    reason: str | None = None


class StockOverviewResponse(ApiSchema):
    ticker: str
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    exchange: str | None = None
    currency: str | None = None
    description: str | None = None
    price: float | None = None
    prev_close: float | None = None
    open: float | None = None
    day_high: float | None = None
    day_low: float | None = None
    bid: float | None = None
    ask: float | None = None
    volume: float | None = None
    avg_volume: float | None = None
    avg_volume_10d: float | None = None
    week_52_high: float | None = None
    week_52_low: float | None = None
    ma_50d: float | None = None
    ma_200d: float | None = None
    market_cap: float | None = None
    enterprise_value: float | None = None
    pe_ttm: float | None = None
    forward_pe: float | None = None
    pb: float | None = None
    ps_ttm: float | None = None
    ev_revenue: float | None = None
    ev_ebitda: float | None = None
    eps_ttm: float | None = None
    eps_fwd: float | None = None
    book_value: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    ebitda_margin: float | None = None
    net_margin: float | None = None
    roa: float | None = None
    roe: float | None = None
    revenue_growth: float | None = None
    earnings_growth: float | None = None
    quarterly_earnings_growth: float | None = None
    revenue: float | None = None
    gross_profits: float | None = None
    ebitda: float | None = None
    operating_cashflow: float | None = None
    free_cashflow: float | None = None
    total_cash: float | None = None
    total_debt: float | None = None
    net_cash_debt: float | None = None
    debt_equity: float | None = None
    current_ratio: float | None = None
    quick_ratio: float | None = None
    shares_outstanding: float | None = None
    insider_pct: float | None = None
    institution_pct: float | None = None
    short_ratio: float | None = None
    dividend_yield: float | None = None
    div_rate: float | None = None
    payout_ratio: float | None = None
    ex_div_date: str | None = None
    beta: float | None = None
    recommendation: str | None = None
    consensus_score: float | None = None
    analyst_count: int | None = None
    target_low: float | None = None
    target_mean: float | None = None
    target_median: float | None = None
    target_high: float | None = None
    upside_downside_pct: float | None = None


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
