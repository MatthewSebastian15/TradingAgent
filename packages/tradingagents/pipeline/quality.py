from __future__ import annotations

# ruff: noqa: E402, F401, F821
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

from tradingagents.pipeline.types import FieldQualityContext


def _price_max_fallback_days() -> int:
    try:
        return max(
            0, int(get_config().get("price_max_fallback_days", DEFAULT_PRICE_MAX_FALLBACK_DAYS))
        )
    except (TypeError, ValueError):
        return DEFAULT_PRICE_MAX_FALLBACK_DAYS


def _quality_warning(
    code: str, severity: str, message: str, blocking: bool = False
) -> dict[str, Any]:
    return {"code": code, "severity": severity, "message": message, "blocking": blocking}


def _warning_detail_from_message(message: str) -> dict[str, Any]:
    lowered = message.lower()
    if "ohlcv_stale" in lowered or (
        "latest ohlcv row" in lowered and "maximum allowed fallback" in lowered
    ):
        return _quality_warning("OHLCV_STALE", "error", message, True)
    if "exact ohlcv date not found" in lowered or "ohlcv_fallback_used" in lowered:
        return _quality_warning("OHLCV_FALLBACK_USED", "warning", message, False)
    if "ohlcv" in lowered and "no available" in lowered:
        return _quality_warning("OHLCV_MISSING", "error", message, True)
    if "partial news" in lowered or "news_partial" in lowered:
        return _quality_warning("NEWS_PARTIAL", "warning", message, False)
    if "no news" in lowered or "news unavailable" in lowered or "news_unavailable" in lowered:
        return _quality_warning("NEWS_UNAVAILABLE", "warning", message, False)
    if "partial fundamentals" in lowered:
        return _quality_warning("FUNDAMENTALS_PARTIAL", "warning", message, False)
    if "only" in lowered and "price rows" in lowered:
        return _quality_warning("PRICE_DATA_PARTIAL", "warning", message, False)
    if "price_data unavailable" in lowered or "no data found" in lowered:
        return _quality_warning("PRICE_MISSING", "error", message, True)
    return _quality_warning("DATA_SOURCE_WARNING", "warning", message, False)


def _warnings_from_fields(fields: list[DataField]) -> list[str]:
    warnings: list[str] = []
    for item in fields:
        if item.warning:
            warnings.append(item.warning)
    return warnings


def _classify_price_data(
    price: DataField,
    fundamentals: DataField,
    trade_date: str,
    price_lookback_days: int,
    warnings: list[str],
    max_fallback_days: int | None = None,
) -> str:
    _ = price_lookback_days
    price_dates = extract_price_dates(price.value)
    allowed_gap = (
        _price_max_fallback_days() if max_fallback_days is None else max(0, int(max_fallback_days))
    )
    if price.status == "missing":
        return "invalid_ticker" if fundamentals.status == "missing" else "missing"
    if trade_date not in price_dates:
        try:
            cutoff = datetime.strptime(trade_date, "%Y-%m-%d")
            available_before_or_on_target = [
                item for item in price_dates if datetime.strptime(item, "%Y-%m-%d") <= cutoff
            ]
        except ValueError:
            available_before_or_on_target = []
        if available_before_or_on_target:
            fallback_date = max(available_before_or_on_target)
            try:
                gap_days = (cutoff - datetime.strptime(fallback_date, "%Y-%m-%d")).days
            except ValueError:
                gap_days = allowed_gap + 1
            if gap_days > allowed_gap:
                warnings.append(
                    "OHLCV_STALE - Latest OHLCV row "
                    f"{fallback_date} is {gap_days} days before trade_date {trade_date}; "
                    f"maximum allowed fallback is {allowed_gap} days."
                )
                return "stale"
            return "ok"
        warnings.append(
            "OHLCV_MISSING - No available OHLCV row found on or before "
            f"{trade_date}; current price cannot be validated."
        )
        return "missing"
    if len(price_dates) < 10:
        warnings.append(
            f"Only {len(price_dates)} price rows found in the Year-on-Year configured vendor "
            "window."
        )
        return "partial"
    return "ok"


def _classify_fundamentals(
    fundamentals: DataField,
    balance_sheet: DataField,
    cashflow: DataField,
    income_statement: DataField,
    warnings: list[str],
) -> str:
    fields = [
        ("fundamentals", fundamentals),
        ("balance_sheet", balance_sheet),
        ("cashflow", cashflow),
        ("income_statement", income_statement),
    ]
    statuses = [item.status for _name, item in fields]
    if all(status == "missing" for status in statuses):
        return "missing"
    if any(status == "missing" for status in statuses):
        missing_parts = [name for name, item in fields if item.status == "missing"]
        warnings.append(
            f"Partial fundamentals from configured vendors; missing: {', '.join(missing_parts)}."
        )
        return "partial"
    return "ok"


def _classify_news(company_news: DataField, global_news: DataField, warnings: list[str]) -> str:
    if company_news.status == "missing" and global_news.status == "missing":
        warnings.append(
            (
                "NEWS_UNAVAILABLE - No usable company-specific or global news was returned; "
                + "analysis continues without blocking trade validation."
            )
        )
        return "unavailable"
    if company_news.status == "missing" or global_news.status == "missing":
        warnings.append(
            (
                "NEWS_PARTIAL - Partial news coverage from configured vendors; company-specific "
                + "or global news is missing."
            )
        )
        return "partial"
    return "ok"


def _build_data_quality(
    trade_date: str,
    price: DataField,
    fundamentals: DataField,
    balance_sheet: DataField,
    cashflow: DataField,
    income_statement: DataField,
    company_news: DataField,
    global_news: DataField,
    all_fields: list[DataField],
    price_lookback_days: int,
) -> DataQualityReport:
    warnings = _warnings_from_fields(all_fields)
    price_status = _classify_price_data(
        price,
        fundamentals,
        trade_date,
        price_lookback_days,
        warnings,
        max_fallback_days=_price_max_fallback_days(),
    )
    fundamentals_status = _classify_fundamentals(
        fundamentals, balance_sheet, cashflow, income_statement, warnings
    )
    news_status = _classify_news(company_news, global_news, warnings)
    deduped_warnings = list(dict.fromkeys(warnings))[:20]
    warning_details = [_warning_detail_from_message(message) for message in deduped_warnings]
    return DataQualityReport(
        price_data=price_status,
        fundamentals=fundamentals_status,
        news=news_status,
        warnings=deduped_warnings,
        warning_details=warning_details,
    )


def _coerce_field_quality_context(
    context: FieldQualityContext | None,
    legacy_kwargs: dict[str, Any],
) -> FieldQualityContext:
    return context if context is not None else FieldQualityContext(**legacy_kwargs)


def _attempts_for_field(vendor_attempts: dict[str, Any] | None, key: str) -> list[dict[str, Any]]:
    attempts = (vendor_attempts or {}).get(key) or []
    if not isinstance(attempts, list):
        return []
    normalized: list[dict[str, Any]] = []
    for item in attempts:
        if isinstance(item, dict):
            normalized.append(item)
            continue
        text = str(item)
        vendor, _, rest = text.partition(":")
        status, _, reason = rest.partition("(")
        normalized.append(
            {
                "vendor": vendor or "unknown",
                "status": status or rest or "unknown",
                "reason": reason.rstrip(")") or None,
                "duration_ms": None,
            }
        )
    return normalized


def _latest_news_date(
    news_context: dict[str, Any] | None, fallback: str | None = None
) -> str | None:
    articles = news_context.get("articles") if isinstance(news_context, dict) else []
    dated_values: list[tuple[datetime, str]] = []
    for article in articles or []:
        if not isinstance(article, dict):
            continue
        for key in ("published_at", "publishedAt", "datetime", "date", "created_at"):
            value = article.get(key)
            parsed = parse_datetime(value)
            if parsed:
                dated_values.append((parsed, str(value)))
                break
    if not dated_values:
        return fallback
    return max(dated_values, key=lambda item: item[0])[1]


def _field_quality_common(ctx: FieldQualityContext) -> dict[str, Any]:
    profile = ctx.company_profile or {}
    validation_summary = ctx.validation_summary or {}
    last_price_validation = (
        validation_summary.get("last_price")
        if isinstance(validation_summary.get("last_price"), dict)
        else {}
    )
    return {
        "profile": profile,
        "performance": ctx.price_performance or {},
        "latest_news_as_of": _latest_news_date(ctx.news_context),
        "price_as_of": ctx.last_close_price_as_of,
        "profile_as_of": profile.get("source_published_date")
        or profile.get("reported_date")
        or profile.get("fetched_at"),
        "last_price_warnings": list(last_price_validation.get("warnings") or []),
        "last_price_vendor_values": dict(last_price_validation.get("vendor_values") or {}),
    }


def _price_quality_fields(
    ctx: FieldQualityContext, common: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    data_sources = ctx.data_sources
    price_as_of = common["price_as_of"]
    return {
        "quote": build_field_quality(
            "quote",
            ctx.last_close_price,
            data_sources.get("quote", "unavailable"),
            as_of_date=price_as_of,
            conflict_warnings=common["last_price_warnings"],
            vendor_values=common["last_price_vendor_values"],
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "quote"),
        ),
        "last_price": build_field_quality(
            "last_price",
            ctx.last_close_price,
            data_sources.get("price", "unavailable"),
            as_of_date=price_as_of,
            conflict_warnings=common["last_price_warnings"],
            vendor_values=common["last_price_vendor_values"],
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "quote"),
        ),
        "stock_price": build_field_quality(
            "stock_price",
            ctx.last_close_price,
            data_sources.get("price", "unavailable"),
            as_of_date=price_as_of,
            conflict_warnings=common["last_price_warnings"],
            vendor_values=common["last_price_vendor_values"],
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "ohlcv"),
        ),
        "volume": build_field_quality(
            "volume",
            common["performance"].get("latest_volume"),
            data_sources.get("ohlcv", "unavailable"),
            as_of_date=price_as_of,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "ohlcv"),
        ),
        "historical_price": build_field_quality(
            "historical_price",
            ctx.price.value,
            data_sources.get("ohlcv", "unavailable"),
            warnings=[ctx.price.warning] if ctx.price.warning else [],
            as_of_date=price_as_of,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "ohlcv"),
        ),
        "technical_indicators": build_field_quality(
            "technical_indicators",
            ctx.technical_indicators.value,
            data_sources.get("technical", "unavailable"),
            warnings=[ctx.technical_indicators.warning] if ctx.technical_indicators.warning else [],
            as_of_date=price_as_of,
            calculated=True,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "ohlcv"),
        ),
    }


def _profile_quality_fields(
    ctx: FieldQualityContext, common: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    profile = common["profile"]
    profile_as_of = common["profile_as_of"]
    quality: dict[str, dict[str, Any]] = {
        "market_cap": build_field_quality(
            "market_cap",
            profile.get("market_cap"),
            "company_profile",
            as_of_date=profile_as_of,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "profile"),
        ),
        "company_profile": build_field_quality(
            "company_profile",
            profile if profile.get("available") else None,
            "company_profile",
            as_of_date=profile_as_of,
            status=profile.get("data_quality", {}).get("status")
            if isinstance(profile.get("data_quality"), dict)
            else None,
            warnings=(profile.get("data_quality", {}) or {}).get("warnings")
            if isinstance(profile.get("data_quality"), dict)
            else [],
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "profile"),
        ),
    }
    for field_name, profile_key in (
        ("sector", "sector"),
        ("industry", "industry"),
        ("country", "country"),
        ("exchange", "exchange"),
        ("executives", "officers"),
        ("shareholders", "shareholders"),
    ):
        quality[field_name] = build_field_quality(
            field_name,
            profile.get(profile_key),
            "company_profile",
            as_of_date=profile_as_of,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "profile"),
        )
    return quality


def _financial_quality_fields(ctx: FieldQualityContext) -> dict[str, dict[str, Any]]:
    data_sources = ctx.data_sources
    financials_source = data_sources.get("financial_statement", "normalized_financial_rows")
    income_source = data_sources.get("income_statement", "normalized_financial_rows")
    quality = {
        "financial_statement": build_field_quality(
            "financial_statement",
            ctx.latest_revenue or ctx.latest_ebitda or ctx.latest_net_profit,
            financials_source,
            as_of_date=ctx.financial_as_of_date,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "financial_statements"),
        ),
        "financial_metrics": build_field_quality(
            "financial_metrics",
            ctx.fundamentals.value,
            data_sources.get("fundamental_profile_metrics", "unavailable"),
            warnings=[ctx.fundamentals.warning] if ctx.fundamentals.warning else [],
            as_of_date=ctx.financial_as_of_date,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "fundamentals"),
        ),
    }
    for field_name, value in (
        ("revenue", ctx.latest_revenue),
        ("ebitda", ctx.latest_ebitda),
        ("net_profit", ctx.latest_net_profit),
    ):
        quality[field_name] = build_field_quality(
            field_name,
            value,
            income_source,
            as_of_date=ctx.financial_as_of_date,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "financial_statements"),
        )
    for field_name, field, source_name in (
        ("balance_sheet", ctx.balance_sheet, "balance_sheet"),
        ("cashflow", ctx.cashflow, "cashflow"),
        ("income_statement", ctx.income_statement, "income_statement"),
    ):
        quality[field_name] = build_field_quality(
            field_name,
            field.value,
            data_sources.get(source_name, "unavailable"),
            warnings=[field.warning] if field.warning else [],
            as_of_date=ctx.financial_as_of_date,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, "financial_statements"),
        )
    return quality


def _news_quality_fields(
    ctx: FieldQualityContext, common: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    data_sources = ctx.data_sources
    latest_news_as_of = common["latest_news_as_of"]
    quality: dict[str, dict[str, Any]] = {}
    for field_name, field, source_key, attempts_key in (
        ("company_news", ctx.company_news, "company_news", "news"),
        ("global_news", ctx.global_news, "global_news", "news"),
        ("news_sentiment", ctx.news_sentiment, "news_sentiment", "news_sentiment"),
        ("social_sentiment", ctx.social_sentiment, "social_sentiment", "social_sentiment"),
    ):
        quality[field_name] = build_field_quality(
            field_name,
            field.value,
            data_sources.get(source_key, "unavailable"),
            warnings=[field.warning] if field.warning else [],
            as_of_date=latest_news_as_of,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, attempts_key),
        )
    return quality


def _signal_quality_fields(ctx: FieldQualityContext) -> dict[str, dict[str, Any]]:
    quality: dict[str, dict[str, Any]] = {}
    for field_name, field, source_key, attempts_key in (
        ("event_risk", ctx.event_risk, "event_risk", "event_risk"),
        ("recommendation_trends", ctx.recommendation_trends, "recommendation_trends", "event_risk"),
        ("insider_transactions", ctx.insider_transactions, "insider", "insider"),
    ):
        quality[field_name] = build_field_quality(
            field_name,
            field.value,
            ctx.data_sources.get(source_key, "unavailable"),
            warnings=[field.warning] if field.warning else [],
            as_of_date=ctx.trade_date,
            vendor_attempts=_attempts_for_field(ctx.vendor_attempts, attempts_key),
        )
    return quality


def _build_field_quality_metadata(
    context: FieldQualityContext | None = None,
    **legacy_kwargs: Any,
) -> dict[str, dict[str, Any]]:
    ctx = _coerce_field_quality_context(context, legacy_kwargs)
    common = _field_quality_common(ctx)
    return {
        **_price_quality_fields(ctx, common),
        **_profile_quality_fields(ctx, common),
        **_financial_quality_fields(ctx),
        **_news_quality_fields(ctx, common),
        **_signal_quality_fields(ctx),
    }
