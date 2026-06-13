from __future__ import annotations

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
from tradingagents.dataflows.config import get_config, set_config, use_config
from tradingagents.dataflows.corporate_actions import apply_corporate_action_adjustments
from tradingagents.dataflows.data_completeness import calculate_completeness
from tradingagents.dataflows.data_quality import (
    DataField,
    DataQualityReport,
    build_field_quality,
    extract_price_dates,
    looks_missing,
)
from tradingagents.dataflows.dividend_data import build_dividend_status
from tradingagents.dataflows.freshness_policy import get_freshness_status, parse_datetime
from tradingagents.dataflows.fundamental_calculator import calculate_derived_fundamentals
from tradingagents.dataflows.fundamental_gap_mapper import map_fundamental_gaps
from tradingagents.dataflows.interface import collect_vendor_values, route_to_all_vendors, route_to_vendor
from tradingagents.dataflows.news_aggregator import deduplicate_news, normalize_url, rank_news
from tradingagents.dataflows.news_intelligence import (
    build_analyst_consensus,
    build_catalyst_tracker,
    build_news_impact,
)
from tradingagents.dataflows.news_service import NewsService, format_news_for_prompt
from tradingagents.dataflows.normalizers import (
    build_financial_highlights_from_normalized_rows,
    build_normalized_period_rows,
)
from tradingagents.dataflows.source_priority import get_field_vendor_order
from tradingagents.dataflows.technical_calculator import (
    calculate_technical_fallback,
    indicator_numeric_value,
    is_missing_indicator,
)
from tradingagents.dataflows.validators import (
    validate_fundamental_consistency,
    validate_price_consistency,
    validate_volume_consistency,
)
from tradingagents.dataflows.vendor_budget import create_budget_from_config, release_budget
from tradingagents.dataflows.vendor_router import create_attempt_recorder, release_attempt_recorder
from tradingagents.dataflows.y_finance import normalize_ticker
from tradingagents.fundamentals.builder import build_fundamental_analysis
from tradingagents.pipeline_balanced_types import AnalysisCancelledError, CollectedData
from tradingagents.prompt_context import build_prompt_context
from tradingagents.technical.entry_quality import build_technical_entry

logger = logging.getLogger(__name__)

T = TypeVar("T")
VALID_TIME_HORIZON_MONTHS = {1, 2, 3}
YEAR_ON_YEAR_PRICE_WINDOW_DAYS = 365
PRICE_CHART_FALLBACK_BUFFER_DAYS = 14
DEFAULT_PRICE_MAX_FALLBACK_DAYS = 7


def _price_max_fallback_days() -> int:
    try:
        return max(0, int(get_config().get("price_max_fallback_days", DEFAULT_PRICE_MAX_FALLBACK_DAYS)))
    except (TypeError, ValueError):
        return DEFAULT_PRICE_MAX_FALLBACK_DAYS


def _quality_warning(code: str, severity: str, message: str, blocking: bool = False) -> dict[str, Any]:
    return {"code": code, "severity": severity, "message": message, "blocking": blocking}


def _warning_detail_from_message(message: str) -> dict[str, Any]:
    lowered = message.lower()
    if "ohlcv_stale" in lowered or ("latest ohlcv row" in lowered and "maximum allowed fallback" in lowered):
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


def _normalize_time_horizon_months(value: Any = 1) -> int:
    if isinstance(value, bool):
        return 1
    try:
        months = int(value)
    except (TypeError, ValueError):
        return 1
    return months if months in VALID_TIME_HORIZON_MONTHS else 1


def _time_horizon_label(time_horizon_months: int) -> str:
    months = _normalize_time_horizon_months(time_horizon_months)
    return f"{months} month" if months == 1 else f"{months} months"


def _horizon_days(time_horizon_months: int) -> int:
    return _normalize_time_horizon_months(time_horizon_months) * 30


def _price_lookback_days(time_horizon_months: int) -> int:
    return YEAR_ON_YEAR_PRICE_WINDOW_DAYS


def _check_cancel(cancel_check: Callable[[], bool] | None) -> None:
    if cancel_check is not None and cancel_check():
        raise AnalysisCancelledError("Analysis was cancelled by the client.")


def _truncate(value: Any, limit: int = 12_000) -> str:
    """Convert *value* to a string and truncate it to *limit* characters."""
    text = str(value or "")
    if len(text) <= limit:
        return text

    boundary = text.rfind("\n", 0, limit)
    cut = boundary if boundary > 0 else limit
    return text[:cut] + "\n\n[TRUNCATED FOR TOKEN CONTROL]"


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
    elif field_name in {"revenue", "ebitda", "net_profit", "market_cap", "total_assets", "assets", "equity"}:
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


def _build_field_sources(ticker: str, data_sources: dict[str, str]) -> dict[str, dict[str, Any]]:
    field_to_source_key = {
        "quote": "quote",
        "last_price": "price",
        "historical_price": "ohlcv",
        "financial_statement": "fundamental_profile_metrics",
        "balance_sheet": "balance_sheet",
        "income_statement": "income_statement",
        "cashflow": "cashflow",
        "company_news": "company_news",
        "global_news": "global_news",
        "news_sentiment": "news_sentiment",
        "insider_transactions": "insider",
        "shareholders": "profile",
        "executives": "profile",
        "corporate_actions": "corporate_actions",
        "dividend": "dividend",
        "profile": "profile",
    }
    field_to_priority_key = {
        "last_price": "quote",
        "financial_statement": "financial_statement",
        "balance_sheet": "financial_statement",
        "income_statement": "financial_statement",
        "cashflow": "financial_statement",
    }
    metadata: dict[str, dict[str, Any]] = {}
    for field_name, source_key in field_to_source_key.items():
        priority_key = field_to_priority_key.get(field_name, field_name)
        metadata[field_name] = {
            "selected_source": data_sources.get(source_key) or "unavailable",
            "vendor_order": get_field_vendor_order(priority_key, ticker),
        }
    return metadata


def _safe_data_field(label: str, func: Callable[[], Any], limit: int = 12_000) -> DataField:
    try:
        raw_value = _call_yfinance_with_resilience(func)
        if isinstance(raw_value, DataField):
            return raw_value
        return DataField.from_text(_truncate(raw_value, limit))
    except Exception as exc:
        logger.warning("Balanced pipeline data call failed for %s: %s", label, exc)
        return DataField.unavailable(label, exc)


def _safe_payload(label: str, func: Callable[[], Any]) -> dict[str, Any]:
    try:
        raw_value = _call_yfinance_with_resilience(func)
        return dict(raw_value) if isinstance(raw_value, dict) else {}
    except Exception as exc:
        logger.warning("Balanced pipeline payload call failed for %s: %s", label, exc)
        return {"available": False, "source": "unavailable", "reason": str(exc)}


def _positive_price(value: Any) -> float | None:
    number = _safe_float(value)
    return number if number is not None and number > 0 else None


def _resolve_current_price_anchor(
    *,
    ohlcv_price: float | None,
    ohlcv_as_of: str | None,
    ohlcv_source: str | None,
    quote: dict[str, Any] | None,
    profile: dict[str, Any] | None,
    trade_date: str,
) -> dict[str, Any]:
    # Historical OHLCV is the canonical Analysis/Chart price snapshot. It is
    # already selected as the last valid close at or before trade_date, so keep
    # the user-facing as_of anchored to trade_date and expose the actual candle
    # date through chart metadata. Do not let profile fast_info override this.
    if ohlcv_price is not None:
        return {
            "price": ohlcv_price,
            "as_of": trade_date,
            "actual_price_as_of": ohlcv_as_of,
            "source": ohlcv_source or "yfinance:last_close",
            "is_fallback": False,
        }

    quote_price = _positive_price(
        (quote or {}).get("current_price") or (quote or {}).get("price") or (quote or {}).get("c")
    )
    if quote_price is not None:
        return {
            "price": quote_price,
            "as_of": trade_date,
            "actual_price_as_of": (quote or {}).get("timestamp") or trade_date,
            "source": (quote or {}).get("source") or (quote or {}).get("price_source") or "quote",
            "is_fallback": False,
        }

    profile_price = _positive_price((profile or {}).get("current_price"))
    if profile_price is not None:
        profile_source = (
            ((profile or {}).get("data_quality") or {}).get("field_sources") or {}
        ).get("current_price")
        profile_method = (profile or {}).get("current_price_source")
        return {
            "price": profile_price,
            "as_of": trade_date,
            "actual_price_as_of": (profile or {}).get("current_price_as_of") or trade_date,
            "source": (
                f"{profile_source}:{profile_method}"
                if profile_source and profile_method
                else profile_method
            )
            or (
                f"{profile_source}:company_profile.current_price"
                if profile_source
                else "company_profile.current_price"
            ),
            "is_fallback": False,
        }

    return {"price": None, "as_of": None, "actual_price_as_of": None, "source": None, "is_fallback": False}


def _deduplicate_news_sections(parts: list[str]) -> list[str]:
    """Deduplicate news headings across vendors by normalized Markdown article title."""
    seen_titles: set[str] = set()
    deduped_parts: list[str] = []
    for part in parts:
        if "news" not in part.lower():
            deduped_parts.append(part)
            continue
        kept_lines: list[str] = []
        skip_article = False
        article_has_content = False
        for line in part.splitlines():
            heading = re.match(r"^###\s+(.+?)(?:\s+\(source:.*\))?$", line.strip(), flags=re.IGNORECASE)
            if heading:
                title_key = " ".join(heading.group(1).lower().split())
                skip_article = title_key in seen_titles
                article_has_content = not skip_article
                if not skip_article:
                    seen_titles.add(title_key)
                    kept_lines.append(line)
                continue
            if skip_article:
                continue
            kept_lines.append(line)
        rendered = "\n".join(kept_lines).strip()
        if rendered and (article_has_content or "###" not in part):
            deduped_parts.append(rendered)
    return deduped_parts


def _safe_multi_source_data_field(label: str, func: Callable[[], dict[str, Any]], limit: int = 12_000) -> DataField:
    """Collect and format every usable vendor payload for high-value fields."""
    try:
        raw_results = func()
        if not raw_results:
            return DataField.from_text("")
        if len(raw_results) == 1:
            only_value = next(iter(raw_results.values()))
            if looks_missing(str(only_value)):
                return DataField.from_text(_truncate(only_value, limit))

        parts: list[str] = []
        for source, value in raw_results.items():
            text = _truncate(value, limit)
            if text.strip():
                parts.append(f"## Source: {source}\n\n{text}")
        if "news" in label.lower():
            parts = _deduplicate_news_sections(parts)
        return DataField.from_text(_truncate("\n\n".join(parts), limit))
    except Exception as exc:
        logger.warning("Balanced pipeline multi-source data call failed for %s: %s", label, exc)
        return DataField.unavailable(label, exc)


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


def _safe_news_data_field(
    label: str,
    method: str,
    *args,
    vendor_order: list[str] | None = None,
    field_name: str | None = None,
    limit: int = 12_000,
) -> DataField:
    config = get_config()
    if bool(config.get("data_vendor_enable_multi_source_news", False)):
        return _safe_multi_source_data_field(
            label,
            lambda: route_to_all_vendors(method, *args, vendor_order=vendor_order, field_name=field_name),
            limit=limit,
        )
    return _safe_data_field(
        label,
        lambda: route_to_vendor(method, *args, vendor_order=vendor_order, field_name=field_name),
        limit=limit,
    )


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
        provider_priority = [
            vendor for vendor in vendor_order if vendor in {"google_news_light", "marketaux", "newsdata"}
        ]
        if provider_priority:
            news_config["provider_priority"] = provider_priority
        news_config["enable_yfinance_fallback"] = "yfinance" in vendor_order
        context = NewsService(config=news_config).fetch_news(ticker, as_of_date=trade_date, window_days=window_days)
        holder.update(context)
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
        return DataField.unavailable("company_news", exc)


def _detect_current_news_source(line: str, fallback: str = "unknown") -> str:
    match = re.match(r"^##\s+Source:\s*(.+)$", line.strip(), flags=re.IGNORECASE)
    if match:
        return match.group(1).strip().lower().replace(" ", "_") or fallback

    lowered = line.lower()
    if "google news light" in lowered or "google_news_light" in lowered:
        return "google_news_light"
    if "marketaux" in lowered:
        return "marketaux"
    if "newsdata" in lowered:
        return "newsdata"
    if "finnhub" in lowered:
        return "finnhub"
    if "alpha vantage" in lowered or "alpha_vantage" in lowered:
        return "alpha_vantage"
    if "yfinance" in lowered:
        return "yfinance"
    return fallback


def _clean_news_summary(text: str, limit: int = 350) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def _usable_news_url(value: Any) -> str | None:
    url = str(value or "").strip()
    if not url:
        return None
    parts = urlsplit(url)
    if parts.scheme.lower() not in {"http", "https"} or not parts.netloc:
        return None
    return url


def _news_relevance_reason(item: dict[str, Any], ticker: str) -> str:
    event_type = str(item.get("event_type") or "general")
    source = str(item.get("source") or "vendor")
    if event_type != "general":
        return f"This article is tagged as {event_type} news and may affect the analysis context for {ticker}."
    return f"This article was returned by {source} as related market news for the selected analysis window."


def _parse_markdown_news_items(text: str, *, default_source: str, ticker: str) -> list[dict[str, Any]]:
    """Parse vendor-formatted Markdown news into structured article dictionaries."""
    items: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    summary_lines: list[str] = []
    current_source = default_source

    def flush_current() -> None:
        nonlocal current, summary_lines
        if not current:
            return

        url = _usable_news_url(current.get("url"))
        current["url"] = url
        current["summary"] = _clean_news_summary("\n".join(summary_lines).strip())
        current["normalized_url"] = normalize_url(url)
        current["related_ticker"] = current.get("related_ticker") or ticker
        current["event_type"] = current.get("event_type") or "general"
        current["relevance_reason"] = _news_relevance_reason(current, ticker)

        if current.get("title") and url:
            items.append(current)

        current = None
        summary_lines = []

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("## "):
            current_source = _detect_current_news_source(line, fallback=current_source or default_source)
            continue

        heading = re.match(r"^###\s+(.+?)(?:\s+\(source:\s*(.*?)\))?$", line, flags=re.IGNORECASE)
        if heading:
            flush_current()
            current = {
                "title": heading.group(1).strip(),
                "publisher": (heading.group(2) or "Unknown").strip(),
                "published_at": None,
                "url": None,
                "summary": "",
                "source": current_source or default_source,
                "event_type": "general",
                "related_ticker": ticker,
            }
            continue

        if current is None:
            continue

        lowered = line.lower()
        if lowered.startswith("published:"):
            current["published_at"] = line.split(":", 1)[1].strip()
            continue
        if lowered.startswith("event type:"):
            current["event_type"] = line.split(":", 1)[1].strip() or "general"
            continue
        if lowered.startswith("provider:"):
            current["source"] = line.split(":", 1)[1].split("|", 1)[0].strip() or current["source"]
            continue
        if lowered.startswith("link:"):
            current["url"] = line.split(":", 1)[1].strip()
            continue
        if lowered.startswith("relevant tickers:"):
            continue

        summary_lines.append(line)

    flush_current()
    return items


def _related_news_items_from_context(news_context: dict[str, Any] | None, ticker: str) -> list[dict[str, Any]]:
    articles = news_context.get("articles") if isinstance(news_context, dict) else []
    if not isinstance(articles, list):
        return []

    items: list[dict[str, Any]] = []
    for article in articles:
        if not isinstance(article, dict):
            continue

        url = _usable_news_url(article.get("url"))
        title = str(article.get("title") or "").strip()
        if not title or not url:
            continue

        source = str(article.get("provider") or article.get("source") or "vendor")
        item = {
            "title": title,
            "publisher": article.get("source") or article.get("publisher") or "Unknown",
            "published_at": article.get("published_at"),
            "url": url,
            "normalized_url": normalize_url(url),
            "summary": _clean_news_summary(article.get("summary") or ""),
            "source": source,
            "event_type": article.get("event_type") or "general",
            "related_ticker": article.get("ticker") or ticker,
            "relevance_score": article.get("relevance_score") or 0,
        }
        item["relevance_reason"] = _news_relevance_reason(item, ticker)
        items.append(item)
    return items


def _build_related_news(
    ticker: str,
    trade_date: str,
    time_horizon_months: int = 1,
    company_news: str | None = None,
    global_news: str | None = None,
    source_label: str | None = None,
    news_context: dict[str, Any] | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    months = _normalize_time_horizon_months(time_horizon_months)
    lookback_days = _horizon_days(months)
    max_items = None if limit is None else max(1, int(limit or 1))

    base_payload: dict[str, Any] = {
        "available": False,
        "ticker": ticker,
        "trade_date": trade_date,
        "lookback_days": lookback_days,
        "source": source_label or "unavailable",
        "summary": "No usable related news was returned for this analysis.",
        "items": [],
    }

    structured_items = _related_news_items_from_context(news_context, ticker)
    company_items = _parse_markdown_news_items(company_news, default_source="company_news", ticker=ticker)
    global_items = _parse_markdown_news_items(global_news, default_source="global_news", ticker=ticker)
    merged = structured_items + company_items + global_items

    if not merged:
        return {**base_payload, "warning": "Related news is unavailable."}

    try:
        ranked = rank_news(deduplicate_news(merged), ticker=ticker)
        if max_items is not None:
            ranked = ranked[:max_items]
    except Exception as exc:
        logger.warning("Failed to rank related news for %s: %s", ticker, exc)
        ranked = merged if max_items is None else merged[:max_items]

    if not ranked:
        return {**base_payload, "warning": "Related news is unavailable after deduplication."}

    source = source_label or "+".join(dict.fromkeys(str(item.get("source") or "unknown") for item in ranked))

    return {
        **base_payload,
        "available": True,
        "source": source,
        "summary": f"Top {len(ranked)} related news items collected from configured vendors for this analysis window.",
        "items": ranked,
    }


def _safe_company_profile(ticker: str, trade_date: str) -> dict[str, Any]:
    try:
        vendor_order = get_field_vendor_order("profile", ticker)
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
        from tradingagents.dataflows.local_indicators import calculate_local_indicators

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


def _extract_last_close_price_and_date(
    price_data: str,
    trade_date: str,
    max_fallback_days: int | None = None,
) -> tuple[float | None, str | None]:
    """Parse the last fresh Close value and row date at or before trade_date from OHLCV CSV."""
    lines = [line for line in (price_data or "").splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if not lines:
        return None, None

    try:
        cutoff = datetime.strptime(trade_date, "%Y-%m-%d")
    except ValueError:
        cutoff = None

    last_date: datetime | None = None
    last_close: float | None = None
    reader = csv.DictReader(StringIO("\n".join(lines)))
    for row in reader:
        if not row:
            continue
        date_raw = (row.get("Date") or row.get("") or next(iter(row.values()), "") or "").strip()
        close_raw = (row.get("Close") or row.get("Adj Close") or "").strip()
        if not date_raw or not close_raw:
            continue
        try:
            row_date = datetime.strptime(date_raw[:10], "%Y-%m-%d")
            close = float(close_raw.replace(",", ""))
        except (TypeError, ValueError):
            continue
        if cutoff is not None and row_date > cutoff:
            continue
        if last_date is None or row_date >= last_date:
            last_date = row_date
            last_close = close
    if last_date is None:
        return None, None
    if cutoff is not None:
        allowed_gap = _price_max_fallback_days() if max_fallback_days is None else max(0, int(max_fallback_days))
        if (cutoff - last_date).days > allowed_gap:
            return None, None
    return last_close, last_date.strftime("%Y-%m-%d")


def _extract_last_close_price(price_data: str, trade_date: str) -> float | None:
    """Parse the last Close value at or before trade_date from yfinance CSV."""
    price, _as_of = _extract_last_close_price_and_date(price_data, trade_date)
    return price


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in {float("inf"), float("-inf")} else None


def _safe_int(value: Any) -> int | None:
    number = _safe_float(value)
    if number is None:
        return None
    try:
        return int(number)
    except (TypeError, ValueError, OverflowError):
        return None


def _currency_for_ticker(ticker: str) -> str:
    normalized = str(ticker or "").upper()
    if normalized.endswith(".JK"):
        return "IDR"
    if normalized.endswith(".HK"):
        return "HKD"
    if normalized.endswith(".T"):
        return "JPY"
    if normalized.endswith(".DE"):
        return "EUR"
    if normalized.endswith(".L"):
        return "GBP"
    return "USD"


def _max_drawdown_percent(closes: list[float]) -> float | None:
    if len(closes) < 2:
        return None
    peak = closes[0]
    max_drawdown = 0.0
    for close in closes:
        if close > peak:
            peak = close
        if peak:
            max_drawdown = min(max_drawdown, ((close - peak) / peak) * 100)
    return round(max_drawdown, 2)


def _volume_trend_label(latest_volume: int | None, average_volume: int | None) -> str:
    if latest_volume is None or average_volume is None or average_volume <= 0:
        return "N/A"
    if latest_volume >= average_volume * 1.1:
        return "above_average"
    if latest_volume <= average_volume * 0.9:
        return "below_average"
    return "average"


def _performance_label(period_return_percent: float | None) -> str:
    if period_return_percent is None:
        return "N/A"
    if period_return_percent > 0:
        return "positive"
    if period_return_percent < 0:
        return "negative"
    return "flat"


def _build_price_chart(
    ticker: str,
    trade_date: str,
    price_data: str,
    time_horizon_months: int,
    source: str | None = None,
) -> dict[str, Any]:
    """Build frontend-ready YOY OHLCV chart data anchored to trade_date with bounded last-trade fallback."""
    lookback_days = _price_lookback_days(time_horizon_months)
    window_label = "YOY Price Window"
    window = "YOY"
    currency = _currency_for_ticker(ticker)
    max_fallback_days = _price_max_fallback_days()

    try:
        requested_cutoff = datetime.strptime(trade_date, "%Y-%m-%d")
        requested_start_cutoff = requested_cutoff - relativedelta(years=1)
    except ValueError:
        requested_cutoff = None
        requested_start_cutoff = None

    requested_start_date = (
        requested_start_cutoff.strftime("%Y-%m-%d") if requested_start_cutoff is not None else None
    )
    requested_end_date = requested_cutoff.strftime("%Y-%m-%d") if requested_cutoff is not None else trade_date

    base_payload: dict[str, Any] = {
        "available": False,
        "source": source or "unavailable",
        "ticker": ticker,
        "trade_date": trade_date,
        "requested_trade_date": trade_date,
        "effective_trade_date": None,
        "price_as_of_date": None,
        "last_trade_date": None,
        "last_available_trade_date": None,
        "fallback_to_last_trade": False,
        "start_date": requested_start_date,
        "end_date": requested_end_date,
        "currency": currency,
        "window": window,
        "window_label": window_label,
        "lookback_days": lookback_days,
        "points": [],
        "data": [],
        "stats": {},
        "summary": {},
        "data_quality": {"status": "unavailable", "missing_fields": ["ohlcv"]},
    }

    lines = [line for line in (price_data or "").splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if not lines:
        return {**base_payload, "warning": "Price chart data is unavailable."}

    parsed_points: list[dict[str, Any]] = []

    try:
        reader = csv.DictReader(StringIO("\n".join(lines)))
        for row in reader:
            if not row:
                continue

            date_raw = (row.get("Date") or row.get("") or next(iter(row.values()), "") or "").strip()
            if not date_raw:
                continue

            try:
                row_date = datetime.strptime(date_raw[:10], "%Y-%m-%d")
            except ValueError:
                continue

            open_price = _safe_float(row.get("Open"))
            high_price = _safe_float(row.get("High"))
            low_price = _safe_float(row.get("Low"))
            close_price = _safe_float(row.get("Close") or row.get("Adj Close"))
            adjusted_close = _safe_float(row.get("Adj Close") or row.get("Adjusted Close") or close_price)
            if any(value is None for value in [open_price, high_price, low_price, close_price]):
                continue

            parsed_points.append(
                {
                    "_row_date": row_date,
                    "date": row_date.strftime("%Y-%m-%d"),
                    "open": open_price,
                    "high": max(high_price, open_price, close_price, low_price),
                    "low": min(low_price, open_price, close_price, high_price),
                    "close": close_price,
                    "adjusted_close": adjusted_close if adjusted_close is not None else close_price,
                    "volume": _safe_int(row.get("Volume")),
                }
            )
    except Exception as exc:
        logger.warning("Failed to build price chart for %s: %s", ticker, exc)
        return {**base_payload, "warning": "Price chart data could not be parsed."}

    parsed_points = sorted(parsed_points, key=lambda item: item["_row_date"])

    if not parsed_points:
        return {**base_payload, "warning": "No usable price rows were available for the selected window."}

    last_available_trade_date = parsed_points[-1]["date"]
    eligible_points = [
        item for item in parsed_points if requested_cutoff is None or item["_row_date"] <= requested_cutoff
    ]

    if not eligible_points:
        return {
            **base_payload,
            "last_available_trade_date": last_available_trade_date,
            "warning": "No usable price rows were available at or before the trade date.",
        }

    effective_cutoff = eligible_points[-1]["_row_date"]
    actual_end_date = effective_cutoff.strftime("%Y-%m-%d")
    display_end_date = requested_end_date or actual_end_date
    fallback_gap_days = (requested_cutoff - effective_cutoff).days if requested_cutoff is not None else 0
    is_stale = requested_cutoff is not None and fallback_gap_days > max_fallback_days
    stale_warning = (
        "OHLCV_STALE - Latest OHLCV row "
        f"{actual_end_date} is {fallback_gap_days} days before trade_date {trade_date}; "
        f"maximum allowed fallback is {max_fallback_days} days."
        if is_stale
        else None
    )

    # start_date must always be anchored to trade_date - 1 year, never to the
    # fallback effective_cutoff, so the YOY window is always exactly
    # [trade_date - 1 year, trade_date] regardless of market holiday/weekend fallback.
    yoy_anchor = requested_cutoff if requested_cutoff is not None else effective_cutoff
    effective_start_cutoff = yoy_anchor - relativedelta(years=1)
    effective_start_date = effective_start_cutoff.strftime("%Y-%m-%d")
    fallback_to_last_trade = bool(
        requested_cutoff is not None and effective_cutoff.date() != requested_cutoff.date()
    )

    start_anchor_candidates = [item for item in parsed_points if item["_row_date"] <= effective_start_cutoff]
    start_anchor = start_anchor_candidates[-1] if start_anchor_candidates else None
    selected_points = [
        item
        for item in parsed_points
        if effective_start_cutoff < item["_row_date"] <= effective_cutoff
    ]
    if start_anchor is not None:
        selected_points = [start_anchor, *selected_points]
    elif requested_start_cutoff is not None:
        selected_points = [
            item
            for item in parsed_points
            if effective_start_cutoff <= item["_row_date"] <= effective_cutoff
        ]

    points = [
        {key: value for key, value in item.items() if key != "_row_date"}
        for item in selected_points
    ]

    if not points:
        return {
            **base_payload,
            "start_date": effective_start_date,
            "end_date": display_end_date,
            "effective_trade_date": display_end_date,
            "price_as_of_date": display_end_date,
            "last_trade_date": display_end_date,
            "last_available_trade_date": last_available_trade_date,
            "fallback_to_last_trade": fallback_to_last_trade,
            "warning": "No usable price rows were available for the selected YOY window.",
        }

    closes = [float(item["close"]) for item in points if item.get("close") is not None]
    highs = [float(item["high"]) for item in points if item.get("high") is not None]
    lows = [float(item["low"]) for item in points if item.get("low") is not None]
    volumes = [int(item["volume"]) for item in points if item.get("volume") is not None]

    start_price = closes[0] if closes else None
    end_price = closes[-1] if closes else None
    change = end_price - start_price if start_price is not None and end_price is not None else None
    change_percent = (change / start_price * 100) if change is not None and start_price else None
    average_volume = round(sum(volumes) / len(volumes)) if volumes else None
    latest_volume = volumes[-1] if volumes else None
    period_return_percent = round(change_percent, 2) if change_percent is not None else None

    stats = {
        "start_price": start_price,
        "end_price": end_price,
        "change": change,
        "change_percent": period_return_percent,
        "high": max(highs) if highs else None,
        "low": min(lows) if lows else None,
        "average_close": round(sum(closes) / len(closes), 2) if closes else None,
        "average_volume": average_volume,
        "point_count": len(points),
    }
    summary = {
        "period_return_percent": period_return_percent,
        "period_high": max(highs) if highs else None,
        "period_low": min(lows) if lows else None,
        "max_drawdown_percent": _max_drawdown_percent(closes),
        "average_volume": average_volume,
        "latest_volume": latest_volume,
        "latest_close": end_price,
        "volume_trend": _volume_trend_label(latest_volume, average_volume),
        "performance_label": _performance_label(period_return_percent),
    }
    missing_fields = []
    if not volumes:
        missing_fields.append("volume")
    warnings: list[str] = []
    if stale_warning:
        warnings.append(stale_warning)
    if is_stale:
        missing_fields.append("fresh_ohlcv")

    available = len(points) >= 2
    data_quality_status = "stale" if is_stale else "complete"
    if not available:
        data_quality_status = "unavailable"
    elif missing_fields:
        data_quality_status = "partial" if not is_stale else "stale"

    return {
        **base_payload,
        "available": available,
        "source": source or "yfinance",
        "start_date": effective_start_date,
        "start_price_as_of_date": points[0].get("date") if points else effective_start_date,
        "end_date": display_end_date,
        "effective_trade_date": display_end_date,
        "price_as_of_date": display_end_date,
        "last_trade_date": display_end_date,
        "last_available_trade_date": last_available_trade_date,
        "fallback_to_last_trade": fallback_to_last_trade,
        "points": points,
        "data": points,
        "stats": stats,
        "summary": summary,
        "data_quality": {
            "status": data_quality_status,
            "missing_fields": list(dict.fromkeys(missing_fields)),
            "max_fallback_days": max_fallback_days,
            "fallback_gap_days": fallback_gap_days,
            "warnings": warnings,
        },
        "warning": warnings[0] if warnings else (
            None if available else "Valid OHLC price chart data is not available for this analysis."
        ),
    }

def _date_window(trade_date: str, time_horizon_months: int = 1) -> tuple[str, str, str]:
    current = datetime.strptime(trade_date, "%Y-%m-%d")
    start_price = (current - relativedelta(years=1)).strftime("%Y-%m-%d")
    start_news = (current - timedelta(days=_horizon_days(time_horizon_months))).strftime("%Y-%m-%d")
    end = current.strftime("%Y-%m-%d")
    return start_price, start_news, end


INDICATOR_NAMES = [
    "close_50_sma",
    "close_200_sma",
    "macd",
    "rsi",
    "atr",
    "boll_ub",
    "boll_lb",
    "mfi",
]


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
        futures = {pool.submit(_run_with_config, config, func): name for name, func in tasks.items()}
        for future in as_completed(futures):
            _check_cancel(cancel_check)
            name = futures[future]
            try:
                results[name] = future.result()
            except Exception as exc:
                logger.warning("Balanced pipeline data future failed for %s: %s", name, exc)
                results[name] = DataField.unavailable(name, exc)
    return results


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
    allowed_gap = _price_max_fallback_days() if max_fallback_days is None else max(0, int(max_fallback_days))
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
            f"Only {len(price_dates)} price rows found in the Year-on-Year configured vendor window."
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
        warnings.append(f"Partial fundamentals from configured vendors; missing: {', '.join(missing_parts)}.")
        return "partial"
    return "ok"


def _classify_news(company_news: DataField, global_news: DataField, warnings: list[str]) -> str:
    if company_news.status == "missing" and global_news.status == "missing":
        warnings.append(
            "NEWS_UNAVAILABLE - No usable company-specific or global news was returned; analysis continues without blocking trade validation."
        )
        return "unavailable"
    if company_news.status == "missing" or global_news.status == "missing":
        warnings.append(
            "NEWS_PARTIAL - Partial news coverage from configured vendors; company-specific or global news is missing."
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
    fundamentals_status = _classify_fundamentals(fundamentals, balance_sheet, cashflow, income_statement, warnings)
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


def _detect_sources_from_text(text: str) -> list[str]:
    lowered = (text or "").lower()
    sources: list[str] = []
    if "google news light" in lowered or "google_news_light" in lowered:
        sources.append("google_news_light")
    if "marketaux" in lowered:
        sources.append("marketaux")
    if "newsdata" in lowered:
        sources.append("newsdata")
    if "finnhub" in lowered:
        sources.append("finnhub")
    if "alpha vantage" in lowered or "alpha_vantage" in lowered:
        sources.append("alpha_vantage")
    if "yfinance" in lowered or "stock data for" in lowered or "## global market news" in lowered:
        sources.append("yfinance")
    return list(dict.fromkeys(sources))


def _source_label(text: str, default: str = "unavailable") -> str:
    sources = _detect_sources_from_text(text)
    return "+".join(sources) if sources else default


def _price_source_label(price_data: str, last_close_price: float | None) -> str | None:
    if last_close_price is None:
        return None
    sources = _detect_sources_from_text(price_data)
    if "finnhub" in sources:
        return "finnhub:stock_candle:last_close"
    if "alpha_vantage" in sources:
        return "alpha_vantage:daily:last_close"
    return "yfinance:last_close"


def _build_data_source_metadata(
    price: DataField,
    fundamentals: DataField,
    balance_sheet: DataField,
    cashflow: DataField,
    income_statement: DataField,
    company_news: DataField,
    global_news: DataField,
    insider_transactions: DataField,
    news_sentiment: DataField,
    social_sentiment: DataField,
    event_risk: DataField,
    recommendation_trends: DataField,
    last_close_price: float | None,
    last_close_price_source: str | None = None,
    vendor_attempts: dict[str, list[str]] | None = None,
    request_budget: dict[str, Any] | None = None,
) -> tuple[dict[str, str], list[str], dict[str, Any]]:
    data_sources = {
        "quote": "routed:yfinance->finnhub->alpha_vantage",
        "price": last_close_price_source or _price_source_label(price.value, last_close_price) or "unavailable",
        "ohlcv": _source_label(price.value),
        "technical": "configured_ohlcv:local_calculation",
        "fundamental_profile_metrics": _source_label(fundamentals.value),
        "balance_sheet": _source_label(balance_sheet.value),
        "cashflow": _source_label(cashflow.value),
        "income_statement": _source_label(income_statement.value),
        "company_news": _source_label(company_news.value),
        "global_news": _source_label(global_news.value),
        "news": "+".join(
            dict.fromkeys(_detect_sources_from_text(company_news.value) + _detect_sources_from_text(global_news.value))
        )
        or "unavailable",
        "news_sentiment": _source_label(news_sentiment.value),
        "social_sentiment": _source_label(social_sentiment.value),
        "event_risk": _source_label(event_risk.value),
        "recommendation_trends": _source_label(recommendation_trends.value),
        "insider": _source_label(insider_transactions.value, default="disabled_or_unavailable"),
        "corporate_actions": "idx_official/yfinance",
        "forex": "deferred",
        "crypto": "deferred",
    }
    limitations = [
        "Finnhub is skipped unless FINNHUB_ENABLED=true and FINNHUB_API_KEY is configured.",
        "Finnhub coverage for Indonesian .JK tickers must be validated per endpoint.",
        "Fallback vendors are used only when earlier vendors return empty, stale, invalid, or unavailable data.",
        "Direct social sentiment can be unavailable for many tickers and must not be invented from news headlines.",
        "Forex and crypto Finnhub integration are deferred for a later phase.",
    ]
    runtime_metadata = {
        "vendor_attempts": vendor_attempts or {},
        "request_budget": request_budget or {},
    }
    return data_sources, limitations, runtime_metadata


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


def latest_date_from_rows(rows: list[dict[str, Any]] | None, keys: tuple[str, ...]) -> str | None:
    dated_values: list[tuple[datetime, str]] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        for key in keys:
            value = row.get(key)
            parsed = parse_datetime(value)
            if parsed:
                dated_values.append((parsed, str(value)))
                break
    if not dated_values:
        return None
    return max(dated_values, key=lambda item: item[0])[1]


def latest_news_published_at(articles: list[dict[str, Any]] | None) -> str | None:
    return latest_date_from_rows(
        articles,
        ("published_at", "publishedAt", "datetime", "date", "created_at"),
    )


def latest_financial_as_of(normalized_period_rows: list[dict[str, Any]] | None) -> str | None:
    for row in reversed(normalized_period_rows or []):
        if not isinstance(row, dict):
            continue
        period = row.get("period") if isinstance(row.get("period"), dict) else {}
        for value in (
            period.get("as_of_date"),
            period.get("reported_date"),
            row.get("reported_date"),
            period.get("period_end"),
            row.get("period_end"),
            row.get("date"),
        ):
            if value:
                return str(value)
    return None


def latest_price_as_of(price_rows: list[dict[str, Any]] | None) -> str | None:
    return latest_date_from_rows(price_rows, ("datetime", "timestamp", "date"))


def latest_corporate_action_as_of(actions: list[dict[str, Any]] | None) -> str | None:
    return latest_date_from_rows(
        actions,
        ("fetched_at", "effective_date", "announcement_date", "ex_date", "payment_date", "date"),
    )


def _latest_news_date(news_context: dict[str, Any] | None, fallback: str | None = None) -> str | None:
    articles = news_context.get("articles") if isinstance(news_context, dict) else []
    return latest_news_published_at(articles) or fallback


def _freshness_payload(field_name: str, as_of_date: str | None) -> dict[str, Any]:
    detail = get_freshness_status(field_name, as_of_date)
    return {
        **detail,
        "freshness_status": detail.get("status"),
        "freshness_detail": detail,
    }


def _build_runtime_freshness_metadata(
    *,
    trade_date: str,
    last_close_price_as_of: str | None,
    news_context: dict[str, Any] | None,
    financial_highlights: dict[str, Any] | None,
) -> dict[str, Any]:
    latest_news_date = _latest_news_date(news_context)
    financial_period_end = None
    financial_as_of_date = None
    if isinstance(financial_highlights, dict):
        period = financial_highlights.get("period")
        if isinstance(period, dict):
            financial_period_end = period.get("period_end")
            financial_as_of_date = period.get("as_of_date") or period.get("reported_date") or financial_period_end
        if financial_period_end is None:
            periods = financial_highlights.get("periods")
            trends = financial_highlights.get("financial_trends")
            if periods is None and isinstance(trends, dict):
                periods = trends.get("periods")
            if isinstance(periods, list) and periods:
                latest_period = periods[-1] if isinstance(periods[-1], dict) else {}
                financial_period_end = (
                    latest_period.get("period_end") or latest_period.get("date") or latest_period.get("key")
                )
                financial_as_of_date = financial_as_of_date or financial_period_end
    return {
        "price": {
            "timestamp": last_close_price_as_of,
            **_freshness_payload("historical_price", last_close_price_as_of),
        },
        "financials": {
            "period_end_date": financial_period_end,
            "as_of_date": financial_as_of_date,
            **_freshness_payload("financial_statement", financial_as_of_date or financial_period_end),
        },
        "news": {
            "latest_article_date": latest_news_date,
            **_freshness_payload("company_news", latest_news_date),
        },
    }


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
            result if isinstance(result, dict) else {"available": False, "corporate_actions": [], "reason": str(result)}
        )
    except Exception as exc:
        logger.warning("Corporate actions unavailable for %s: %s", ticker, exc)
        return {"available": False, "corporate_actions": [], "reason": str(exc), "source": "unavailable"}


def _numeric_value(value: Any) -> float | None:
    if isinstance(value, dict):
        value = value.get("value", value.get("normalized_value"))
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _latest_derived_metric(derived_fundamentals: list[dict[str, Any]] | None, field: str) -> dict[str, Any] | None:
    for row in reversed(derived_fundamentals or []):
        if not isinstance(row, dict):
            continue
        metrics = row.get("derived_metrics") if isinstance(row.get("derived_metrics"), dict) else row
        value = metrics.get(field) if isinstance(metrics, dict) else None
        if isinstance(value, dict):
            return value
        if value is not None:
            return {"value": value, "status": "calculated", "source": "local_calculation_from_normalized_financials"}
    return None


def _latest_statement_value(rows: list[dict[str, Any]] | None, field: str) -> float | None:
    for row in reversed(rows or []):
        if not isinstance(row, dict):
            continue
        value = row.get(field)
        number = _numeric_value(value)
        if number is not None:
            return number
    return None


def _normalize_technical_entry_for_display(technical_entry: dict[str, Any]) -> dict[str, Any]:
    entry = dict(technical_entry or {})
    quality = dict(entry.get("indicator_quality") or {})
    for key in ("sma_20", "sma_50", "sma_200", "volatility", "rsi_14"):
        value = entry.get(key)
        if isinstance(value, dict):
            quality[key] = value
            numeric = indicator_numeric_value(value)
            if numeric is not None:
                entry[key] = numeric
    if quality:
        entry["indicator_quality"] = quality
    return entry


def _apply_technical_fallback(technical_entry: dict[str, Any], price_history: Any) -> dict[str, Any]:
    entry = dict(technical_entry or {})
    fallback = calculate_technical_fallback(price_history)
    indicator_quality = dict(entry.get("indicator_quality") or {})
    for key in ("sma_20", "sma_50", "sma_200", "volatility"):
        fallback_value = fallback.get(key)
        if fallback_value is None:
            continue
        if is_missing_indicator(entry.get(key)):
            indicator_quality[key] = fallback_value
            numeric = indicator_numeric_value(fallback_value)
            entry[key] = numeric if numeric is not None else fallback_value
        else:
            indicator_quality.setdefault(
                key,
                {
                    "value": indicator_numeric_value(entry.get(key)) or entry.get(key),
                    "status": "available",
                    "source": "vendor_or_entry_quality",
                    "reason": None,
                    "warnings": [],
                },
            )
    entry["technical_fallback"] = fallback
    entry["indicator_quality"] = indicator_quality
    return entry


def _corporate_action_summary(corporate_actions_result: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, Any]:
    summary = {
        "source": corporate_actions_result.get("source") or "idx_official/yfinance",
        "split": None,
        "rights_issue": None,
    }
    for row in rows or []:
        text = " ".join(str(row.get(key) or "") for key in ("type", "action", "event", "description")).lower()
        if "split" in text:
            summary["split"] = row
        if "right" in text or "hmtd" in text:
            summary["rights_issue"] = row
    return summary


@dataclass(slots=True)
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


def _coerce_field_quality_context(
    context: FieldQualityContext | None,
    legacy_kwargs: dict[str, Any],
) -> FieldQualityContext:
    return context if context is not None else FieldQualityContext(**legacy_kwargs)


def _field_quality_common(ctx: FieldQualityContext) -> dict[str, Any]:
    profile = ctx.company_profile or {}
    validation_summary = ctx.validation_summary or {}
    last_price_validation = (
        validation_summary.get("last_price") if isinstance(validation_summary.get("last_price"), dict) else {}
    )
    return {
        "profile": profile,
        "performance": ctx.price_performance or {},
        "latest_news_as_of": _latest_news_date(ctx.news_context),
        "price_as_of": ctx.last_close_price_as_of,
        "profile_as_of": profile.get("source_published_date") or profile.get("reported_date") or profile.get("fetched_at"),
        "last_price_warnings": list(last_price_validation.get("warnings") or []),
        "last_price_vendor_values": dict(last_price_validation.get("vendor_values") or {}),
    }


def _price_quality_fields(ctx: FieldQualityContext, common: dict[str, Any]) -> dict[str, dict[str, Any]]:
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


def _profile_quality_fields(ctx: FieldQualityContext, common: dict[str, Any]) -> dict[str, dict[str, Any]]:
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
            status=profile.get("data_quality", {}).get("status") if isinstance(profile.get("data_quality"), dict) else None,
            warnings=(profile.get("data_quality", {}) or {}).get("warnings") if isinstance(profile.get("data_quality"), dict) else [],
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


def _news_quality_fields(ctx: FieldQualityContext, common: dict[str, Any]) -> dict[str, dict[str, Any]]:
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
        key: all_results.get(key, DataField.unavailable(key, RuntimeError("annual statement task did not complete")))
        for key in annual_task_names
    }
    return results, annual_statement_results


def _collection_field_bundle(results: dict[str, DataField], annual_results: dict[str, DataField]) -> dict[str, Any]:
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
    _attach_corporate_action_adjustments(price_chart, corporate_actions_result, corporate_actions_rows)
    price_performance = dict(price_chart.get("summary") or {}) if isinstance(price_chart, dict) else {}
    if isinstance(price_chart, dict):
        price_performance["adjusted_price_history"] = price_chart.get("adjusted_price_history") or []
        price_performance["corporate_action_adjustment"] = price_chart.get("corporate_action_adjustment") or {
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
    adjusted_rows = apply_corporate_action_adjustments(price_chart.get("points") or [], corporate_actions_rows)
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
        last_close_price_source=ctx["last_close_price_source"] if ctx["last_close_price"] is not None else None,
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
    collected.prompt_context = build_prompt_context(collected)
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
        income_statement={"annual": annual_income_statement.value, "quarterly": income_statement.value},
        balance_sheet={"annual": annual_balance_sheet.value, "quarterly": balance_sheet.value},
        cashflow={"annual": annual_cashflow.value, "quarterly": cashflow.value},
        default_currency=financial_currency,
    )
    derived_fundamentals = calculate_derived_fundamentals(normalized_period_rows)
    latest_derived = derived_fundamentals[-1].get("derived_metrics", {}) if derived_fundamentals else {}
    financial_as_of = latest_financial_as_of(normalized_period_rows)
    technical_as_of = (
        latest_price_as_of(price_chart.get("points") if isinstance(price_chart, dict) else None)
        or last_close_price_as_of
    )
    corporate_actions_as_of = latest_corporate_action_as_of(corporate_actions_rows)
    latest_revenue = _latest_statement_value(normalized_period_rows, "revenue")
    latest_ebitda = _latest_statement_value(normalized_period_rows, "ebitda")
    latest_net_profit = _latest_statement_value(normalized_period_rows, "net_profit")
    latest_free_cash_flow = _numeric_value((latest_derived.get("free_cash_flow") or {}).get("value"))
    if latest_free_cash_flow is None:
        latest_free_cash_flow = _latest_statement_value(normalized_period_rows, "free_cash_flow")
    dividend_events = [
        row
        for row in corporate_actions_rows
        if isinstance(row, dict)
        and "dividend"
        in " ".join(str(row.get(key) or "") for key in ("type", "action", "event", "description")).lower()
    ]
    dividend_quality = build_dividend_status(
        ticker=ticker,
        dividends=dividend_events if corporate_actions_result.get("available", True) else None,
        latest_price=last_close_price,
        net_profit=latest_net_profit,
        free_cash_flow=latest_free_cash_flow,
        source=corporate_actions_result.get("source") or "idx_corporate_action",
    )
    corporate_action_summary = _corporate_action_summary(corporate_actions_result, corporate_actions_rows)

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
        data_quality.warnings = list(dict.fromkeys([*(data_quality.warnings or []), *validation_warnings]))[:20]
        data_quality.warning_details = [_warning_detail_from_message(message) for message in data_quality.warnings]
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
            else technical_entry.get(field_name) or (technical_entry.get("rsi") if field_name == "rsi_14" else None)
        )
        data_quality.field_quality[field_name] = build_field_quality(
            field_name,
            indicator_value,
            source=(indicator_quality or {}).get("source") or "local_calculation_from_historical_price",
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
            income_statement={"quarterly": income_statement.value, "annual": annual_income_statement.value},
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
        fundamental_analysis.get("dividend_quality") if isinstance(fundamental_analysis, dict) else None
    )
    if isinstance(existing_dividend_quality, dict):
        fundamental_analysis["dividend_quality"] = {**existing_dividend_quality, **dividend_quality}
    else:
        fundamental_analysis["dividend_quality"] = dividend_quality

    latest_balance_sheet = normalized_period_rows[-1] if normalized_period_rows else {}
    latest_cashflow = {
        "operating_cash_flow": _latest_statement_value(normalized_period_rows, "operating_cash_flow"),
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
        "sma_20": (technical_entry.get("indicator_quality") or {}).get("sma_20") or technical_entry.get("sma_20"),
        "sma_50": (technical_entry.get("indicator_quality") or {}).get("sma_50") or technical_entry.get("sma_50"),
        "sma_200": (technical_entry.get("indicator_quality") or {}).get("sma_200") or technical_entry.get("sma_200"),
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
