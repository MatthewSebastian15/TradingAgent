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


def _check_cancel(cancel_check: Callable[[], bool] | None) -> None:
    if cancel_check is not None and cancel_check():
        raise AnalysisCancelledError("Analysis was cancelled by the client.")


def _call_yfinance_with_resilience(func: Callable[[], Any]) -> Any:
    # route_to_vendor is the single app-level retry/circuit/timeout layer for
    # market-data calls. yfinance-specific helpers keep their narrow transient
    # retry, so the balanced pipeline must not wrap the same field again.
    return func()


def _run_with_config(config: dict[str, Any], func: Callable[[], T]) -> T:
    with use_config(config):
        return func()


def run_cross_vendor_validation(field_name: str, vendor_values: dict[str, float]) -> dict[str, Any]:
    """Validate numeric values from multiple vendors and return API-ready metadata."""
    normalized_values = dict(vendor_values or {})
    if len(normalized_values) < 2:
        return {
            "field_name": field_name,
            "status": "skipped",
            "vendor_values": normalized_values,
            "warnings": [],
            "reason": "less_than_two_vendor_values",
        }

    if field_name in {"quote", "last_price", "price"}:
        warnings = validate_price_consistency(normalized_values)
    elif field_name == "volume":
        warnings = validate_volume_consistency(normalized_values)
    elif field_name in {
        "revenue",
        "ebitda",
        "net_profit",
        "market_cap",
        "total_assets",
        "assets",
        "equity",
    }:
        warnings = validate_fundamental_consistency(field_name, normalized_values)
    else:
        warnings = []

    return {
        "field_name": field_name,
        "status": "conflict" if warnings else "available",
        "vendor_values": normalized_values,
        "warnings": warnings,
        "reason": None if warnings else "within_tolerance",
    }


def _collect_quote_validation(ticker: str, trade_date: str) -> dict[str, Any]:
    try:
        vendor_results = route_to_all_vendors(
            "get_quote",
            ticker,
            trade_date,
            vendor_order=get_field_vendor_order("quote", ticker),
            field_name="last_price",
        )
    except Exception as exc:
        return {
            "field_name": "last_price",
            "status": "skipped",
            "vendor_values": {},
            "warnings": [],
            "reason": f"quote_validation_unavailable: {exc}",
        }
    vendor_values = collect_vendor_values(vendor_results, "last_price")
    return run_cross_vendor_validation("last_price", vendor_values)


def _fetch_news_field(
    method: str,
    *args,
    vendor_order: list[str] | None = None,
    field_name: str | None = None,
) -> Any:
    config = get_config()
    if bool(config.get("data_vendor_enable_multi_source_news", False)):
        return route_to_all_vendors(method, *args, vendor_order=vendor_order, field_name=field_name)
    return route_to_vendor(method, *args, vendor_order=vendor_order, field_name=field_name)


def _safe_structured_company_news(
    ticker: str,
    trade_date: str,
    window_days: int,
    holder: dict[str, Any],
    *,
    limit: int = 12_000,
) -> DataField:
    try:
        vendor_order = get_field_vendor_order("company_news", ticker)
        news_config = dict(get_config().get("news") or {})
        if bool(news_config.get("strict_ai_analysis_mode", True)):
            strict_order = "google_news_light,marketaux,rss_context,newsdata,yfinance"
            news_config["provider_priority"] = strict_order
            news_config["enabled_providers"] = news_config.get("enabled_providers") or strict_order
            news_config["enable_yfinance_fallback"] = True
        else:
            provider_priority = [
                vendor
                for vendor in vendor_order
                if vendor in {"google_news_light", "marketaux", "newsdata"}
            ]
            if provider_priority:
                news_config["provider_priority"] = provider_priority
            news_config["enable_yfinance_fallback"] = "yfinance" in vendor_order
        context = NewsService(config=news_config).fetch_news(
            ticker, as_of_date=trade_date, window_days=window_days
        )
        holder.update(context)
        compact_context = build_news_context(
            ticker,
            "ID" if ticker.upper().endswith(".JK") else "US",
            context,
            max_articles=8,
        ).get("news_context", {})
        holder.update(compact_context)
        return DataField.from_text(_truncate(format_news_for_prompt(context), limit))
    except Exception as exc:
        logger.warning("Structured company news fetch failed for %s: %s", ticker, exc)
        holder.update(
            {
                "enabled": True,
                "ticker": ticker,
                "window_days": window_days,
                "providers_used": [],
                "provider_status": {"service": "unknown_error"},
                "articles_found": 0,
                "articles_used_in_prompt": 0,
                "articles": [],
                "empty_reason": "News providers are temporarily unavailable.",
            }
        )
        holder.update(
            build_news_context(
                ticker,
                "ID" if ticker.upper().endswith(".JK") else "US",
                holder,
                max_articles=8,
            ).get("news_context", {})
        )
        return DataField.unavailable("company_news", exc)


def _safe_company_profile(ticker: str, trade_date: str) -> dict[str, Any]:
    try:
        vendor_order = list(get_field_vendor_order("profile", ticker))
        if "alpha_vantage" not in vendor_order:
            vendor_order.append("alpha_vantage")
        return build_company_profile(
            ticker=ticker,
            fetch_vendor=lambda vendor: route_to_vendor(
                "get_company_profile",
                ticker,
                trade_date,
                vendor_order=[vendor],
                field_name="profile",
            ),
            vendor_order=vendor_order,
        )
    except Exception as exc:
        logger.warning("company_profile fetch failed for %s: %s", ticker, exc)
        return {
            "available": False,
            "ticker": ticker,
            "warning": str(exc),
        }


def _extract_price_dataframe(price_field: DataField) -> Any:
    try:
        import pandas as pd

        lines = [
            line
            for line in (price_field.value or "").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        if not lines:
            return pd.DataFrame()
        return pd.read_csv(StringIO("\n".join(lines)))
    except Exception as exc:
        logger.warning("Failed to parse OHLCV data for local indicators: %s", exc)
        try:
            import pandas as pd

            return pd.DataFrame()
        except Exception:
            return None


def _safe_local_indicator_field(price_field: DataField) -> DataField:
    try:
        from tradingagents.dataflows.market.local_indicators import calculate_local_indicators

        price_df = _extract_price_dataframe(price_field)
        indicators = calculate_local_indicators(price_df)
        text = json.dumps(indicators, indent=2, ensure_ascii=False)
        if indicators.get("available"):
            return DataField(value=text, status="ok", warning=None)
        reason = str(indicators.get("reason") or "Indicators unavailable")
        return DataField(value=text, status="missing", warning=reason)
    except Exception as exc:
        message = f"Local indicators unavailable: {exc}"
        logger.warning(message)
        return DataField(value=message, status="missing", warning=message)


def _build_collection_tasks(
    ticker: str,
    trade_date: str,
    start_price: str,
    start_news: str,
    end: str,
    news_lookback_days: int,
    news_context_holder: dict[str, Any] | None = None,
) -> dict[str, Callable[[], DataField]]:
    news_context_holder = news_context_holder if news_context_holder is not None else {}
    tasks: dict[str, Callable[[], DataField]] = {
        "price_data": lambda: _safe_data_field(
            "price_data",
            lambda: route_to_vendor(
                "get_stock_data",
                ticker,
                start_price,
                end,
                vendor_order=get_field_vendor_order("historical_price", ticker),
                field_name="historical_price",
            ),
            limit=14_000,
        ),
        "fundamentals": lambda: _safe_data_field(
            "fundamentals",
            lambda: route_to_vendor(
                "get_fundamentals",
                ticker,
                trade_date,
                vendor_order=get_field_vendor_order("financial_statement", ticker),
                field_name="financial_statement",
            ),
            limit=12_000,
        ),
        "balance_sheet": lambda: _safe_data_field(
            "balance_sheet",
            lambda: route_to_vendor(
                "get_balance_sheet",
                ticker,
                "quarterly",
                trade_date,
                vendor_order=get_field_vendor_order("financial_statement", ticker),
                field_name="financial_statement",
            ),
            limit=10_000,
        ),
        "cashflow": lambda: _safe_data_field(
            "cashflow",
            lambda: route_to_vendor(
                "get_cashflow",
                ticker,
                "quarterly",
                trade_date,
                vendor_order=get_field_vendor_order("financial_statement", ticker),
                field_name="financial_statement",
            ),
            limit=10_000,
        ),
        "income_statement": lambda: _safe_data_field(
            "income_statement",
            lambda: route_to_vendor(
                "get_income_statement",
                ticker,
                "quarterly",
                trade_date,
                vendor_order=get_field_vendor_order("financial_statement", ticker),
                field_name="financial_statement",
            ),
            limit=10_000,
        ),
        "insider_transactions": lambda: _safe_data_field(
            "insider_transactions",
            lambda: route_to_vendor(
                "get_insider_transactions",
                ticker,
                vendor_order=get_field_vendor_order("insider_transactions", ticker),
                field_name="insider_transactions",
            ),
            limit=6_000,
        ),
        "news_sentiment": lambda: _safe_data_field(
            "news_sentiment",
            lambda: route_to_vendor(
                "get_news_sentiment",
                ticker,
                vendor_order=get_field_vendor_order("news_sentiment", ticker),
                field_name="news_sentiment",
            ),
            limit=4_000,
        ),
        "social_sentiment": lambda: _safe_data_field(
            "social_sentiment",
            lambda: route_to_vendor("get_social_sentiment", ticker, start_news, end),
            limit=5_000,
        ),
        "event_risk": lambda: _safe_data_field(
            "event_risk",
            lambda: route_to_vendor("get_earnings_calendar", ticker, trade_date, end),
            limit=5_000,
        ),
        "recommendation_trends": lambda: _safe_data_field(
            "recommendation_trends",
            lambda: route_to_vendor("get_recommendation_trends", ticker),
            limit=4_000,
        ),
    }
    tasks["company_news"] = lambda: _safe_structured_company_news(
        ticker,
        trade_date,
        news_lookback_days,
        news_context_holder,
        limit=12_000,
    )
    tasks["global_news"] = lambda: _safe_news_data_field(
        "global_news",
        "get_global_news",
        trade_date,
        news_lookback_days,
        10,
        vendor_order=get_field_vendor_order("global_news", ticker),
        field_name="global_news",
        limit=8_000,
    )
    return tasks


def _build_annual_tasks(
    ticker: str,
    trade_date: str,
) -> dict[str, Callable[[], DataField]]:
    """Annual statement tasks are independent and can run with the main batch."""
    vendor_order = get_field_vendor_order("financial_statement", ticker)
    return {
        "annual_balance_sheet": lambda: _safe_data_field(
            "annual_balance_sheet",
            lambda: route_to_vendor(
                "get_balance_sheet",
                ticker,
                "annual",
                trade_date,
                vendor_order=vendor_order,
                field_name="financial_statement",
            ),
            limit=10_000,
        ),
        "annual_income_statement": lambda: _safe_data_field(
            "annual_income_statement",
            lambda: route_to_vendor(
                "get_income_statement",
                ticker,
                "annual",
                trade_date,
                vendor_order=vendor_order,
                field_name="financial_statement",
            ),
            limit=10_000,
        ),
        "annual_cashflow": lambda: _safe_data_field(
            "annual_cashflow",
            lambda: route_to_vendor(
                "get_cashflow",
                ticker,
                "annual",
                trade_date,
                vendor_order=vendor_order,
                field_name="financial_statement",
            ),
            limit=10_000,
        ),
    }


def _run_collection_tasks(
    tasks: dict[str, Callable[[], DataField]],
    config: dict[str, Any],
    cancel_check: Callable[[], bool] | None,
) -> dict[str, DataField]:
    results: dict[str, DataField] = {}
    max_workers = min(max(1, int(config.get("data_collection_workers", 12))), len(tasks))
    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="balanced-data") as pool:
        futures = {
            pool.submit(_run_with_config, config, func): name for name, func in tasks.items()
        }
        for future in as_completed(futures):
            _check_cancel(cancel_check)
            name = futures[future]
            try:
                results[name] = future.result()
            except Exception as exc:
                logger.warning("Balanced pipeline data future failed for %s: %s", name, exc)
                results[name] = DataField.unavailable(name, exc)
    return results


def _safe_corporate_actions(ticker: str, start_date: str, end_date: str) -> dict[str, Any]:
    try:
        result = route_to_vendor(
            "get_corporate_actions",
            ticker,
            start_date,
            end_date,
            vendor_order=get_field_vendor_order("corporate_actions", ticker),
            field_name="corporate_actions",
        )
        return (
            result
            if isinstance(result, dict)
            else {"available": False, "corporate_actions": [], "reason": str(result)}
        )
    except Exception as exc:
        logger.warning("Corporate actions unavailable for %s: %s", ticker, exc)
        return {
            "available": False,
            "corporate_actions": [],
            "reason": str(exc),
            "source": "unavailable",
        }


def _run_market_collection_tasks(
    *,
    ticker: str,
    trade_date: str,
    start_price: str,
    start_news: str,
    end: str,
    news_lookback_days: int,
    news_context: dict[str, Any],
    config: dict[str, Any],
    cancel_check: Callable[[], bool] | None,
) -> tuple[dict[str, DataField], dict[str, DataField]]:
    primary_tasks = _build_collection_tasks(
        ticker,
        trade_date,
        start_price,
        start_news,
        end,
        news_lookback_days,
        news_context_holder=news_context,
    )
    annual_task_names = {"annual_balance_sheet", "annual_income_statement", "annual_cashflow"}
    tasks = {**primary_tasks, **_build_annual_tasks(ticker, trade_date)}
    all_results = _run_collection_tasks(tasks, config, cancel_check)
    results = {key: value for key, value in all_results.items() if key not in annual_task_names}
    annual_statement_results = {
        key: all_results.get(
            key, DataField.unavailable(key, RuntimeError("annual statement task did not complete"))
        )
        for key in annual_task_names
    }
    return results, annual_statement_results


def _collection_field_bundle(
    results: dict[str, DataField], annual_results: dict[str, DataField]
) -> dict[str, Any]:
    price = results["price_data"]
    bundle = {
        "price": price,
        "fundamentals": results["fundamentals"],
        "balance_sheet": results["balance_sheet"],
        "cashflow": results["cashflow"],
        "income_statement": results["income_statement"],
        "annual_balance_sheet": annual_results["annual_balance_sheet"],
        "annual_income_statement": annual_results["annual_income_statement"],
        "annual_cashflow": annual_results["annual_cashflow"],
        "company_news": results["company_news"],
        "global_news": results["global_news"],
        "insider_transactions": results["insider_transactions"],
        "news_sentiment": results.get("news_sentiment", DataField.from_text("")),
        "social_sentiment": results.get("social_sentiment", DataField.from_text("")),
        "event_risk": results.get("event_risk", DataField.from_text("")),
        "recommendation_trends": results.get("recommendation_trends", DataField.from_text("")),
        "technical_indicators": _safe_local_indicator_field(price),
    }
    bundle["all_fields"] = [
        bundle["price"],
        bundle["fundamentals"],
        bundle["balance_sheet"],
        bundle["cashflow"],
        bundle["income_statement"],
        bundle["company_news"],
        bundle["global_news"],
        bundle["insider_transactions"],
        bundle["news_sentiment"],
        bundle["social_sentiment"],
        bundle["event_risk"],
        bundle["recommendation_trends"],
        bundle["technical_indicators"],
    ]
    return bundle


def _resolve_price_runtime(
    *,
    ticker: str,
    trade_date: str,
    start_price: str,
    end: str,
    time_horizon_months: int,
    price: DataField,
    company_profile: dict[str, Any],
) -> dict[str, Any]:
    ohlcv_last_close_price, ohlcv_last_close_price_as_of = _extract_last_close_price_and_date(
        price.value,
        trade_date,
        max_fallback_days=_price_max_fallback_days(),
    )
    ohlcv_price_source = _price_source_label(price.value, ohlcv_last_close_price)
    quote_payload: dict[str, Any] = {}
    if ohlcv_last_close_price is None:
        quote_payload = _safe_payload(
            "quote",
            lambda: route_to_vendor(
                "get_quote",
                ticker,
                trade_date,
                vendor_order=get_field_vendor_order("quote", ticker),
                field_name="quote",
            ),
        )
    price_anchor = _resolve_current_price_anchor(
        ohlcv_price=ohlcv_last_close_price,
        ohlcv_as_of=ohlcv_last_close_price_as_of,
        ohlcv_source=ohlcv_price_source,
        quote=quote_payload,
        profile=company_profile,
        trade_date=trade_date,
    )
    price_chart = _build_price_chart(
        ticker=ticker,
        trade_date=trade_date,
        price_data=price.value,
        time_horizon_months=time_horizon_months,
        source=ohlcv_price_source or _source_label(price.value, "yfinance"),
    )
    corporate_actions_result = _safe_corporate_actions(ticker, start_price, end)
    corporate_actions_rows = (
        corporate_actions_result.get("corporate_actions")
        if isinstance(corporate_actions_result.get("corporate_actions"), list)
        else []
    )
    _attach_corporate_action_adjustments(
        price_chart, corporate_actions_result, corporate_actions_rows
    )
    price_performance = (
        dict(price_chart.get("summary") or {}) if isinstance(price_chart, dict) else {}
    )
    if isinstance(price_chart, dict):
        price_performance["adjusted_price_history"] = (
            price_chart.get("adjusted_price_history") or []
        )
        price_performance["corporate_action_adjustment"] = price_chart.get(
            "corporate_action_adjustment"
        ) or {
            "status": "source_unavailable",
            "source": "unavailable",
            "action_count": 0,
        }
    technical_history = price_chart.get("data") or price_chart.get("points") or price.value
    technical_entry = build_technical_entry(
        technical_history,
        current_price=price_anchor["price"],
        config={"time_horizon_months": time_horizon_months},
    )
    technical_entry = _apply_technical_fallback(technical_entry, technical_history)
    return {
        "last_close_price": price_anchor["price"],
        "last_close_price_as_of": price_anchor["as_of"],
        "last_close_price_source": price_anchor["source"],
        "last_close_price_is_fallback": bool(price_anchor["is_fallback"]),
        "ohlcv_price_source": ohlcv_price_source,
        "price_chart": price_chart,
        "corporate_actions_result": corporate_actions_result,
        "corporate_actions_rows": corporate_actions_rows,
        "price_performance": price_performance,
        "technical_history": technical_history,
        "technical_entry": technical_entry,
    }


def _attach_corporate_action_adjustments(
    price_chart: dict[str, Any],
    corporate_actions_result: dict[str, Any],
    corporate_actions_rows: list[dict[str, Any]],
) -> None:
    if not isinstance(price_chart, dict) or not price_chart.get("available"):
        return
    adjusted_rows = apply_corporate_action_adjustments(
        price_chart.get("points") or [], corporate_actions_rows
    )
    price_chart["adjusted_price_history"] = adjusted_rows
    price_chart["corporate_action_adjustment"] = {
        "status": "available" if corporate_actions_rows else "source_unavailable",
        "source": corporate_actions_result.get("source") or "idx_official/yfinance",
        "action_count": len(corporate_actions_rows),
        "warnings": corporate_actions_result.get("warnings") or [],
        "reason": corporate_actions_result.get("reason"),
    }


def _release_collection_runtime(budget_id: str, attempt_id: str) -> None:
    try:
        release_budget(budget_id)
        release_attempt_recorder(attempt_id)
    except Exception:
        pass


def _build_collected_market_data(ctx: dict[str, Any]) -> CollectedData:
    collected = CollectedData(
        ticker=ctx["ticker"],
        trade_date=ctx["trade_date"],
        time_horizon_months=ctx["time_horizon_months"],
        price_data=ctx["price"].value,
        technical_indicators=ctx["technical_indicators"].value,
        fundamentals=ctx["fundamentals"].value,
        balance_sheet=ctx["balance_sheet"].value,
        cashflow=ctx["cashflow"].value,
        income_statement=ctx["income_statement"].value,
        company_news=ctx["company_news"].value,
        global_news=ctx["global_news"].value,
        insider_transactions=ctx["insider_transactions"].value,
        news_sentiment=ctx["news_sentiment"].value,
        social_sentiment=ctx["social_sentiment"].value,
        event_risk=ctx["event_risk"].value,
        recommendation_trends=ctx["recommendation_trends"].value,
        data_quality=ctx["data_quality"],
        last_close_price=ctx["last_close_price"],
        last_close_price_as_of=ctx["last_close_price_as_of"],
        last_close_price_source=ctx["last_close_price_source"]
        if ctx["last_close_price"] is not None
        else None,
        last_close_price_is_fallback=ctx["last_close_price_is_fallback"],
        company_profile=ctx["company_profile"],
        price_chart=ctx["price_chart"],
        price_performance=ctx["price_performance"],
        technical_entry=ctx["technical_entry"],
        news_context=ctx["news_context"],
        related_news=ctx["related_news"],
        news_impact=ctx["news_impact"],
        catalyst_tracker=ctx["catalyst_tracker"],
        analyst_consensus=ctx["analyst_consensus"],
        data_sources=ctx["data_sources"],
        data_limitations=ctx["data_limitations"],
        field_sources=ctx["field_sources"],
        validation_summary=ctx["validation_summary"],
        warnings=ctx["data_quality"].warnings,
        vendor_attempts=ctx["runtime_metadata"].get("vendor_attempts", {}),
        request_budget=ctx["runtime_metadata"].get("request_budget", {}),
        data_freshness=ctx["data_freshness"],
        data_completeness=ctx["data_completeness"],
        fundamental_gap_report=ctx["fundamental_gap_report"],
        normalized_period_rows=ctx["normalized_period_rows"],
        derived_fundamentals=ctx["derived_fundamentals"],
        financial_highlights=ctx["financial_highlights"],
        fundamental_analysis=ctx["fundamental_analysis"],
    )
    safety_context = build_safety_prompt_context(
        {
            "symbol": collected.ticker,
            "market": "ID" if collected.ticker.upper().endswith(".JK") else "US",
            "field_sources": collected.field_sources or {},
            "data_quality": collected.data_quality.model_dump(),
            "field_quality": collected.data_quality.field_quality,
            "limitations": collected.data_limitations or [],
            "sector": (collected.company_profile or {}).get("sector")
            if isinstance(collected.company_profile, dict)
            else None,
            "normalized_financials": collected.normalized_period_rows or [],
            "news_context": collected.news_context or {},
            "vendor_budget": collected.request_budget or {},
            "warnings": collected.warnings or [],
        }
    )
    collected.safety_prompt_context = safety_context
    collected.prompt_context = build_legacy_prompt_context(collected)
    return collected


def collect_market_data(
    ticker: str,
    trade_date: str,
    config: dict[str, Any],
    cancel_check: Callable[[], bool] | None = None,
) -> CollectedData:
    """Collect external data in parallel and classify yfinance data quality."""
    _check_cancel(cancel_check)
    budget_id, budget = create_budget_from_config(config)
    attempt_id, attempt_recorder = create_attempt_recorder()
    config = dict(config)
    config["_vendor_budget_id"] = budget_id
    config["_vendor_attempt_recorder_id"] = attempt_id
    set_config(config)
    ticker = normalize_ticker(ticker)
    time_horizon_months = _normalize_time_horizon_months(config.get("time_horizon_months", 1))
    news_lookback_days = _horizon_days(time_horizon_months)
    price_lookback = _price_lookback_days(time_horizon_months)
    start_price, start_news, end = _date_window(trade_date, time_horizon_months)

    news_context: dict[str, Any] = {}
    results, annual_statement_results = _run_market_collection_tasks(
        ticker=ticker,
        trade_date=trade_date,
        start_price=start_price,
        start_news=start_news,
        end=end,
        news_lookback_days=news_lookback_days,
        news_context=news_context,
        config=config,
        cancel_check=cancel_check,
    )
    fields = _collection_field_bundle(results, annual_statement_results)
    price = fields["price"]
    fundamentals = fields["fundamentals"]
    balance_sheet = fields["balance_sheet"]
    cashflow = fields["cashflow"]
    income_statement = fields["income_statement"]
    annual_balance_sheet = fields["annual_balance_sheet"]
    annual_income_statement = fields["annual_income_statement"]
    annual_cashflow = fields["annual_cashflow"]
    company_news = fields["company_news"]
    global_news = fields["global_news"]
    insider_transactions = fields["insider_transactions"]
    news_sentiment = fields["news_sentiment"]
    social_sentiment = fields["social_sentiment"]
    event_risk = fields["event_risk"]
    recommendation_trends = fields["recommendation_trends"]
    technical_indicators = fields["technical_indicators"]
    company_profile = _safe_company_profile(ticker, trade_date)
    data_quality = _build_data_quality(
        trade_date,
        price,
        fundamentals,
        balance_sheet,
        cashflow,
        income_statement,
        company_news,
        global_news,
        fields["all_fields"],
        price_lookback,
    )

    _check_cancel(cancel_check)
    price_runtime = _resolve_price_runtime(
        ticker=ticker,
        trade_date=trade_date,
        start_price=start_price,
        end=end,
        time_horizon_months=time_horizon_months,
        price=price,
        company_profile=company_profile,
    )
    last_close_price = price_runtime["last_close_price"]
    last_close_price_as_of = price_runtime["last_close_price_as_of"]
    last_close_price_source = price_runtime["last_close_price_source"]
    last_close_price_is_fallback = price_runtime["last_close_price_is_fallback"]
    ohlcv_price_source = price_runtime["ohlcv_price_source"]
    price_chart = price_runtime["price_chart"]
    corporate_actions_result = price_runtime["corporate_actions_result"]
    corporate_actions_rows = price_runtime["corporate_actions_rows"]
    price_performance = price_runtime["price_performance"]
    technical_history = price_runtime["technical_history"]
    technical_entry = price_runtime["technical_entry"]

    financial_currency = _currency_for_ticker(ticker)
    normalized_period_rows = build_normalized_period_rows(
        income_statement={
            "annual": annual_income_statement.value,
            "quarterly": income_statement.value,
        },
        balance_sheet={"annual": annual_balance_sheet.value, "quarterly": balance_sheet.value},
        cashflow={"annual": annual_cashflow.value, "quarterly": cashflow.value},
        default_currency=financial_currency,
    )
    derived_fundamentals = calculate_derived_fundamentals(normalized_period_rows)
    latest_derived = (
        derived_fundamentals[-1].get("derived_metrics", {}) if derived_fundamentals else {}
    )
    financial_as_of = latest_financial_as_of(normalized_period_rows)
    technical_as_of = (
        latest_price_as_of(price_chart.get("points") if isinstance(price_chart, dict) else None)
        or last_close_price_as_of
    )
    corporate_actions_as_of = latest_corporate_action_as_of(corporate_actions_rows)
    latest_revenue = _latest_statement_value(normalized_period_rows, "revenue")
    latest_ebitda = _latest_statement_value(normalized_period_rows, "ebitda")
    latest_net_profit = _latest_statement_value(normalized_period_rows, "net_profit")
    latest_free_cash_flow = _numeric_value(
        (latest_derived.get("free_cash_flow") or {}).get("value")
    )
    if latest_free_cash_flow is None:
        latest_free_cash_flow = _latest_statement_value(normalized_period_rows, "free_cash_flow")
    dividend_events = [
        row
        for row in corporate_actions_rows
        if isinstance(row, dict)
        and "dividend"
        in " ".join(
            str(row.get(key) or "") for key in ("type", "action", "event", "description")
        ).lower()
    ]
    dividend_quality = build_dividend_status(
        ticker=ticker,
        dividends=dividend_events if corporate_actions_result.get("available", True) else None,
        latest_price=last_close_price,
        net_profit=latest_net_profit,
        free_cash_flow=latest_free_cash_flow,
        source=corporate_actions_result.get("source") or "idx_corporate_action",
    )
    corporate_action_summary = _corporate_action_summary(
        corporate_actions_result, corporate_actions_rows
    )

    validation_summary = {"last_price": _collect_quote_validation(ticker, trade_date)}
    validation_warnings = list(validation_summary["last_price"].get("warnings") or [])

    vendor_attempts = attempt_recorder.get_detailed_summary()
    request_budget = budget.get_summary()
    data_sources, data_limitations, runtime_metadata = _build_data_source_metadata(
        price,
        fundamentals,
        balance_sheet,
        cashflow,
        income_statement,
        company_news,
        global_news,
        insider_transactions,
        news_sentiment,
        social_sentiment,
        event_risk,
        recommendation_trends,
        last_close_price,
        last_close_price_source=last_close_price_source,
        vendor_attempts=vendor_attempts,
        request_budget=request_budget,
    )
    if validation_warnings:
        data_quality.warnings = list(
            dict.fromkeys([*(data_quality.warnings or []), *validation_warnings])
        )[:20]
        data_quality.warning_details = [
            _warning_detail_from_message(message) for message in data_quality.warnings
        ]
    field_sources = _build_field_sources(ticker, data_sources)
    data_quality.field_quality = _build_field_quality_metadata(
        FieldQualityContext(
            trade_date=trade_date,
            data_sources=data_sources,
            price=price,
            fundamentals=fundamentals,
            balance_sheet=balance_sheet,
            cashflow=cashflow,
            income_statement=income_statement,
            company_news=company_news,
            global_news=global_news,
            insider_transactions=insider_transactions,
            news_sentiment=news_sentiment,
            social_sentiment=social_sentiment,
            technical_indicators=technical_indicators,
            event_risk=event_risk,
            recommendation_trends=recommendation_trends,
            last_close_price=last_close_price,
            company_profile=company_profile,
            price_performance=price_performance,
            vendor_attempts=vendor_attempts,
            news_context=news_context,
            last_close_price_as_of=last_close_price_as_of,
            financial_as_of_date=financial_as_of,
            latest_revenue=latest_revenue,
            latest_ebitda=latest_ebitda,
            latest_net_profit=latest_net_profit,
            validation_summary=validation_summary,
        )
    )
    derived_quality_fields = {
        "revenue_growth_percent": "revenue_growth_percent",
        "net_profit_growth_percent": "net_profit_growth_percent",
        "ebitda_margin": "ebitda_margin",
        "ebitda_margin_percent": "ebitda_margin",
        "net_profit_margin": "net_profit_margin",
        "net_profit_margin_percent": "net_profit_margin",
        "free_cash_flow": "free_cash_flow",
        "cfo_to_net_income": "cfo_to_net_income",
        "net_debt": "net_debt",
    }
    for field_name, metric_name in derived_quality_fields.items():
        metric = _latest_derived_metric(derived_fundamentals, metric_name)
        data_quality.field_quality[field_name] = build_field_quality(
            field_name,
            (metric or {}).get("value"),
            source="local_calculation_from_normalized_financials",
            status=(metric or {}).get("status") or "source_unavailable",
            warnings=(metric or {}).get("warnings") or [],
            as_of_date=financial_as_of,
        )
    for field_name, value_name in (
        ("dividend_yield", "dividend_yield"),
        ("dividend_yield_percent", "dividend_yield_percent"),
        ("payout_ratio", "payout_ratio"),
        ("payout_ratio_percent", "payout_ratio_percent"),
        ("fcf_coverage", "fcf_coverage"),
    ):
        data_quality.field_quality[field_name] = build_field_quality(
            field_name,
            dividend_quality.get(value_name),
            source=dividend_quality.get("source") or "idx_corporate_action",
            status=dividend_quality.get("dividend_status") or "source_unavailable",
            warnings=dividend_quality.get("warnings") or [],
            as_of_date=dividend_quality.get("as_of_date") or corporate_actions_as_of,
            reason=dividend_quality.get("reason"),
        )
    data_quality.field_quality["corporate_actions"] = build_field_quality(
        "corporate_actions",
        corporate_actions_rows,
        source=corporate_actions_result.get("source") or "idx_official/yfinance",
        status="available" if corporate_actions_rows else "source_unavailable",
        warnings=corporate_actions_result.get("warnings") or [],
        as_of_date=corporate_actions_as_of,
        reason=corporate_actions_result.get("reason"),
    )
    for field_name in ("sma_20", "sma_50", "sma_200", "volatility", "rsi", "rsi_14"):
        indicator_quality = (
            (technical_entry.get("indicator_quality") or {}).get(field_name)
            if isinstance(technical_entry, dict)
            else None
        )
        indicator_value = (
            indicator_numeric_value(indicator_quality)
            if indicator_quality
            else technical_entry.get(field_name)
            or (technical_entry.get("rsi") if field_name == "rsi_14" else None)
        )
        data_quality.field_quality[field_name] = build_field_quality(
            field_name,
            indicator_value,
            source=(indicator_quality or {}).get("source")
            or "local_calculation_from_historical_price",
            status=(indicator_quality or {}).get("status") or "available",
            warnings=(indicator_quality or {}).get("warnings") or [],
            as_of_date=technical_as_of,
        )
        if isinstance(indicator_quality, dict) and indicator_quality.get("reason"):
            data_quality.field_quality[field_name]["reason"] = indicator_quality.get("reason")
    data_quality.data_sources = dict(data_sources)
    related_news = _build_related_news(
        ticker=ticker,
        trade_date=trade_date,
        time_horizon_months=time_horizon_months,
        company_news=company_news.value,
        global_news=global_news.value,
        source_label=data_sources.get("news"),
        news_context=news_context,
        limit=8,
    )
    news_impact = build_news_impact(
        ticker=ticker,
        trade_date=trade_date,
        related_news=related_news,
        news_context=news_context,
    )
    catalyst_tracker = build_catalyst_tracker(news_impact, event_risk.value)
    analyst_consensus = build_analyst_consensus(recommendation_trends.value)
    financial_highlights = build_financial_highlights_from_normalized_rows(
        normalized_period_rows,
        analysis_date=trade_date,
        currency=financial_currency,
        current_price=last_close_price,
        price_data=price.value,
        company_profile=company_profile,
        dividends=dividend_events,
    )
    financial_highlights["derived_fundamentals"] = derived_fundamentals
    data_freshness = _build_runtime_freshness_metadata(
        trade_date=trade_date,
        last_close_price_as_of=last_close_price_as_of,
        news_context=news_context,
        financial_highlights=financial_highlights,
    )
    fundamental_analysis = None
    try:
        fundamental_analysis = build_fundamental_analysis(
            ticker=ticker,
            analysis_date=trade_date,
            financial_highlights=financial_highlights,
            fundamentals=fundamentals.value,
            income_statement={
                "quarterly": income_statement.value,
                "annual": annual_income_statement.value,
            },
            balance_sheet={"quarterly": balance_sheet.value, "annual": annual_balance_sheet.value},
            cashflow={"quarterly": cashflow.value, "annual": annual_cashflow.value},
            dividends=dividend_events,
            price_data=price.value,
            company_profile=company_profile,
            current_price=last_close_price,
        )
    except Exception:
        logger.exception("Failed to build deterministic fundamental analysis for %s", ticker)
    if fundamental_analysis is None:
        fundamental_analysis = {}
    existing_dividend_quality = (
        fundamental_analysis.get("dividend_quality")
        if isinstance(fundamental_analysis, dict)
        else None
    )
    if isinstance(existing_dividend_quality, dict):
        fundamental_analysis["dividend_quality"] = {**existing_dividend_quality, **dividend_quality}
    else:
        fundamental_analysis["dividend_quality"] = dividend_quality

    latest_balance_sheet = normalized_period_rows[-1] if normalized_period_rows else {}
    latest_cashflow = {
        "operating_cash_flow": _latest_statement_value(
            normalized_period_rows, "operating_cash_flow"
        ),
        "free_cash_flow": latest_free_cash_flow,
    }
    latest_revenue = _latest_statement_value(normalized_period_rows, "revenue")
    latest_ebitda = _latest_statement_value(normalized_period_rows, "ebitda")

    completeness_input = {
        "quote": last_close_price,
        "historical_price": price.value,
        "market_cap": (company_profile or {}).get("market_cap"),
        "volume": (price_performance or {}).get("latest_volume"),
        "revenue": latest_revenue or (financial_highlights or {}).get("revenue"),
        "ebitda": latest_ebitda or (financial_highlights or {}).get("ebitda"),
        "net_profit": latest_net_profit or (financial_highlights or {}).get("net_profit"),
        "assets": _numeric_value(latest_balance_sheet.get("assets")),
        "equity": _numeric_value(latest_balance_sheet.get("equity")),
        "cashflow": latest_cashflow,
        "company_news": company_news.value,
        "global_news": global_news.value,
        "high_impact_news": (news_impact or {}).get("high_impact_news"),
        "news_sentiment": news_sentiment.value,
        "social_sentiment": social_sentiment.value,
        "company_profile": company_profile,
        "executives": (company_profile or {}).get("officers"),
        "shareholders": (company_profile or {}).get("shareholders"),
        "dividend": dividend_quality,
        "split": corporate_action_summary.get("split"),
        "rights_issue": corporate_action_summary.get("rights_issue"),
        "sma_20": (technical_entry.get("indicator_quality") or {}).get("sma_20")
        or technical_entry.get("sma_20"),
        "sma_50": (technical_entry.get("indicator_quality") or {}).get("sma_50")
        or technical_entry.get("sma_50"),
        "sma_200": (technical_entry.get("indicator_quality") or {}).get("sma_200")
        or technical_entry.get("sma_200"),
        "volatility": (technical_entry.get("indicator_quality") or {}).get("volatility"),
        "pe_ratio": (fundamental_analysis.get("valuation_multiples") or {}).get("pe"),
        "pb_ratio": (fundamental_analysis.get("valuation_multiples") or {}).get("pbv"),
        "ev_ebitda": (fundamental_analysis.get("valuation_multiples") or {}).get("ev_ebitda"),
        "fair_value_range": fundamental_analysis.get("fair_value_range"),
        "leverage": (fundamental_analysis.get("balance_sheet_risk") or {}).get("der"),
        "drawdown": (price_performance or {}).get("max_drawdown_percent"),
        "liquidity": (fundamental_analysis.get("balance_sheet_risk") or {}).get("cash_ratio"),
        "beta": (company_profile or {}).get("beta"),
    }
    data_completeness = calculate_completeness(completeness_input)
    fundamental_payload_for_gap = {
        "financial_highlights": financial_highlights or {},
        "fundamentals": fundamentals.value,
        "income_statement": income_statement.value,
        "annual_income_statement": annual_income_statement.value,
        "balance_sheet": balance_sheet.value,
        "annual_balance_sheet": annual_balance_sheet.value,
        "cashflow": cashflow.value,
        "annual_cashflow": annual_cashflow.value,
        "derived_fundamentals": derived_fundamentals,
        "dividend_quality": dividend_quality,
        "technical_entry": technical_entry or {},
    }
    fundamental_gap_report = map_fundamental_gaps(fundamental_payload_for_gap)

    _release_collection_runtime(budget_id, attempt_id)
    return _build_collected_market_data(locals())
