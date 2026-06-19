from __future__ import annotations

# ruff: noqa: F401
import csv
import json
import logging
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta
from io import StringIO
from typing import Any, TypeVar
from urllib.parse import urlsplit

from dateutil.relativedelta import relativedelta

from tradingagents.company_profile.builder import build_company_profile
from tradingagents.dataflows.fundamentals.dividend_data import build_dividend_status
from tradingagents.dataflows.fundamentals.fundamental_calculator import (
    calculate_derived_fundamentals,
)
from tradingagents.dataflows.fundamentals.fundamental_gap_mapper import map_fundamental_gaps
from tradingagents.dataflows.fundamentals.normalizers import (
    build_financial_highlights_from_normalized_rows,
    build_normalized_period_rows,
)
from tradingagents.dataflows.market.corporate_actions import apply_corporate_action_adjustments
from tradingagents.dataflows.market.technical_calculator import (
    calculate_technical_fallback,
    indicator_numeric_value,
    is_missing_indicator,
)
from tradingagents.dataflows.news.news_aggregator import deduplicate_news, normalize_url, rank_news
from tradingagents.dataflows.news.news_context_builder import build_news_context
from tradingagents.dataflows.news.news_intelligence import (
    build_analyst_consensus,
    build_catalyst_tracker,
    build_news_impact,
)
from tradingagents.dataflows.news.news_service import NewsService, format_news_for_prompt
from tradingagents.dataflows.providers.config import get_config, set_config, use_config
from tradingagents.dataflows.providers.interface import (
    collect_vendor_values,
    route_to_all_vendors,
    route_to_vendor,
)
from tradingagents.dataflows.providers.source_priority import get_field_vendor_order
from tradingagents.dataflows.providers.vendor_budget import (
    create_budget_from_config,
    release_budget,
)
from tradingagents.dataflows.providers.vendor_router import (
    create_attempt_recorder,
    release_attempt_recorder,
)
from tradingagents.dataflows.providers.y_finance import normalize_ticker
from tradingagents.dataflows.quality.data_completeness import calculate_completeness
from tradingagents.dataflows.quality.data_quality import (
    DataField,
    DataQualityReport,
    build_field_quality,
    extract_price_dates,
    looks_missing,
)
from tradingagents.dataflows.quality.freshness_policy import get_freshness_status, parse_datetime
from tradingagents.dataflows.quality.validators import (
    validate_fundamental_consistency,
    validate_price_consistency,
    validate_volume_consistency,
)
from tradingagents.fundamentals.builder import build_fundamental_analysis
from tradingagents.graph.prompt_context_builder import (
    build_prompt_context as build_safety_prompt_context,
)
from tradingagents.pipeline_balanced_types import AnalysisCancelledError, CollectedData
from tradingagents.prompt_context import build_prompt_context as build_legacy_prompt_context
from tradingagents.technical.entry_quality import build_technical_entry

logger = logging.getLogger(__name__)

T = TypeVar("T")
VALID_TIME_HORIZON_MONTHS = {1, 2, 3}
YEAR_ON_YEAR_PRICE_WINDOW_DAYS = 365
PRICE_CHART_FALLBACK_BUFFER_DAYS = 14
DEFAULT_PRICE_MAX_FALLBACK_DAYS = 7


@dataclass
class FieldQualityContext:
    trade_date: str
    data_sources: dict[str, str]
    price: DataField
    fundamentals: DataField
    balance_sheet: DataField
    cashflow: DataField
    income_statement: DataField
    company_news: DataField
    global_news: DataField
    insider_transactions: DataField
    news_sentiment: DataField
    social_sentiment: DataField
    technical_indicators: DataField
    event_risk: DataField
    recommendation_trends: DataField
    last_close_price: float | None
    company_profile: dict[str, Any] | None
    price_performance: dict[str, Any] | None
    vendor_attempts: dict[str, Any] | None = None
    news_context: dict[str, Any] | None = None
    last_close_price_as_of: str | None = None
    financial_as_of_date: str | None = None
    latest_revenue: float | None = None
    latest_ebitda: float | None = None
    latest_net_profit: float | None = None
    validation_summary: dict[str, Any] | None = None
