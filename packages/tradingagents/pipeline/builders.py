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


def _truncate(value: Any, limit: int = 12_000) -> str:
    """Convert *value* to a string and truncate it to *limit* characters."""
    text = str(value or "")
    if len(text) <= limit:
        return text

    boundary = text.rfind("\n", 0, limit)
    cut = boundary if boundary > 0 else limit
    return text[:cut] + "\n\n[TRUNCATED FOR TOKEN CONTROL]"


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

    return {
        "price": None,
        "as_of": None,
        "actual_price_as_of": None,
        "source": None,
        "is_fallback": False,
    }


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
            heading = re.match(
                r"^###\s+(.+?)(?:\s+\(source:.*\))?$", line.strip(), flags=re.IGNORECASE
            )
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


def _safe_multi_source_data_field(
    label: str, func: Callable[[], dict[str, Any]], limit: int = 12_000
) -> DataField:
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
            lambda: route_to_all_vendors(
                method, *args, vendor_order=vendor_order, field_name=field_name
            ),
            limit=limit,
        )
    return _safe_data_field(
        label,
        lambda: route_to_vendor(method, *args, vendor_order=vendor_order, field_name=field_name),
        limit=limit,
    )


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
        return (
            f"This article is tagged as {event_type} news and may affect the analysis context "
            f"for {ticker}."
        )
    return (
        f"This article was returned by {source} as related market news for the selected "
        "analysis window."
    )


def _parse_markdown_news_items(
    text: str, *, default_source: str, ticker: str
) -> list[dict[str, Any]]:
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
            current_source = _detect_current_news_source(
                line, fallback=current_source or default_source
            )
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


def _related_news_items_from_context(
    news_context: dict[str, Any] | None, ticker: str
) -> list[dict[str, Any]]:
    if not isinstance(news_context, dict):
        return []
    articles = (
        news_context.get("decision_company_news")
        or news_context.get("prompt_articles")
        or news_context.get("articles")
    )
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
    max_items = (8 if source_label is None else None) if limit is None else max(1, int(limit or 1))

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
    company_items = _parse_markdown_news_items(
        company_news, default_source="company_news", ticker=ticker
    )
    global_items = _parse_markdown_news_items(
        global_news, default_source="global_news", ticker=ticker
    )
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

    source = source_label or "+".join(
        dict.fromkeys(str(item.get("source") or "unknown") for item in ranked)
    )

    return {
        **base_payload,
        "available": True,
        "source": source,
        "summary": (
            f"Top {len(ranked)} related news items collected from configured vendors for this "
            "analysis window."
        ),
        "items": ranked,
    }


def _extract_last_close_price_and_date(
    price_data: str,
    trade_date: str,
    max_fallback_days: int | None = None,
) -> tuple[float | None, str | None]:
    """Parse the last fresh Close value and row date at or before trade_date from OHLCV CSV."""
    lines = [
        line
        for line in (price_data or "").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
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
        allowed_gap = (
            _price_max_fallback_days()
            if max_fallback_days is None
            else max(0, int(max_fallback_days))
        )
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
    """Build frontend-ready YOY OHLCV chart data anchored to trade_date with bounded \
last-trade fallback."""
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
    requested_end_date = (
        requested_cutoff.strftime("%Y-%m-%d") if requested_cutoff is not None else trade_date
    )

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

    lines = [
        line
        for line in (price_data or "").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not lines:
        return {**base_payload, "warning": "Price chart data is unavailable."}

    parsed_points: list[dict[str, Any]] = []

    try:
        reader = csv.DictReader(StringIO("\n".join(lines)))
        for row in reader:
            if not row:
                continue

            date_raw = (
                row.get("Date") or row.get("") or next(iter(row.values()), "") or ""
            ).strip()
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
            adjusted_close = _safe_float(
                row.get("Adj Close") or row.get("Adjusted Close") or close_price
            )
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
        return {
            **base_payload,
            "warning": "No usable price rows were available for the selected window.",
        }

    last_available_trade_date = parsed_points[-1]["date"]
    eligible_points = [
        item
        for item in parsed_points
        if requested_cutoff is None or item["_row_date"] <= requested_cutoff
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
    fallback_gap_days = (
        (requested_cutoff - effective_cutoff).days if requested_cutoff is not None else 0
    )
    is_stale = requested_cutoff is not None and fallback_gap_days > max_fallback_days
    stale_warning = (
        "OHLCV_STALE - Latest OHLCV row "
        f"{actual_end_date} is {fallback_gap_days} days before trade_date {trade_date}; "
        f"maximum allowed fallback is {max_fallback_days} days."
        if is_stale
        else None
    )

    requested_anchor_candidates = (
        [item for item in parsed_points if item["_row_date"] <= requested_start_cutoff]
        if requested_start_cutoff is not None
        else []
    )
    # Keep the requested YOY label when a real historical anchor exists.
    # Otherwise, anchor the displayed window to the effective last trade date.
    effective_start_cutoff = (
        requested_start_cutoff
        if requested_anchor_candidates and requested_start_cutoff is not None
        else effective_cutoff - relativedelta(years=1)
    )
    effective_start_date = effective_start_cutoff.strftime("%Y-%m-%d")
    fallback_to_last_trade = bool(
        requested_cutoff is not None and effective_cutoff.date() != requested_cutoff.date()
    )

    start_anchor_candidates = [
        item for item in parsed_points if item["_row_date"] <= effective_start_cutoff
    ]
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
        "warning": warnings[0]
        if warnings
        else (
            None if available else "Valid OHLC price chart data is not available for this analysis."
        ),
    }


def _date_window(trade_date: str, time_horizon_months: int = 1) -> tuple[str, str, str]:
    current = datetime.strptime(trade_date, "%Y-%m-%d")
    start_price = (current - relativedelta(years=1)).strftime("%Y-%m-%d")
    start_news = (current - timedelta(days=_horizon_days(time_horizon_months))).strftime("%Y-%m-%d")
    end = current.strftime("%Y-%m-%d")
    return start_price, start_news, end


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
    if "sec_companyfacts" in lowered or "sec company facts" in lowered:
        sources.append("sec_companyfacts")
    if (
        "yfinance" in lowered
        or "stock data for" in lowered
        or "balance sheet data for" in lowered
        or "cash flow data for" in lowered
        or "income statement data for" in lowered
        or "company fundamentals for" in lowered
        or "## global market news" in lowered
    ):
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
        "price": last_close_price_source
        or _price_source_label(price.value, last_close_price)
        or "unavailable",
        "ohlcv": _source_label(price.value),
        "technical": "configured_ohlcv:local_calculation",
        "fundamental_profile_metrics": _source_label(fundamentals.value),
        "balance_sheet": _source_label(balance_sheet.value),
        "cashflow": _source_label(cashflow.value),
        "income_statement": _source_label(income_statement.value),
        "company_news": _source_label(company_news.value),
        "global_news": _source_label(global_news.value),
        "news": "+".join(
            dict.fromkeys(
                _detect_sources_from_text(company_news.value)
                + _detect_sources_from_text(global_news.value)
            )
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
        (
            "Fallback vendors are used only when earlier vendors return empty, stale, invalid, "
            + "or unavailable data."
        ),
        (
            "Direct social sentiment can be unavailable for many tickers and must not be "
            + "invented from news headlines."
        ),
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


def _latest_news_date(
    news_context: dict[str, Any] | None, fallback: str | None = None
) -> str | None:
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
            financial_as_of_date = (
                period.get("as_of_date") or period.get("reported_date") or financial_period_end
            )
        if financial_period_end is None:
            periods = financial_highlights.get("periods")
            trends = financial_highlights.get("financial_trends")
            if periods is None and isinstance(trends, dict):
                periods = trends.get("periods")
            if isinstance(periods, list) and periods:
                latest_period = periods[-1] if isinstance(periods[-1], dict) else {}
                financial_period_end = (
                    latest_period.get("period_end")
                    or latest_period.get("date")
                    or latest_period.get("key")
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
            **_freshness_payload(
                "financial_statement", financial_as_of_date or financial_period_end
            ),
        },
        "news": {
            "latest_article_date": latest_news_date,
            **_freshness_payload("company_news", latest_news_date),
        },
    }


def _numeric_value(value: Any) -> float | None:
    if isinstance(value, dict):
        value = value.get("value", value.get("normalized_value"))
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _latest_derived_metric(
    derived_fundamentals: list[dict[str, Any]] | None, field: str
) -> dict[str, Any] | None:
    for row in reversed(derived_fundamentals or []):
        if not isinstance(row, dict):
            continue
        metrics = (
            row.get("derived_metrics") if isinstance(row.get("derived_metrics"), dict) else row
        )
        value = metrics.get(field) if isinstance(metrics, dict) else None
        if isinstance(value, dict):
            return value
        if value is not None:
            return {
                "value": value,
                "status": "calculated",
                "source": "local_calculation_from_normalized_financials",
            }
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


def _apply_technical_fallback(
    technical_entry: dict[str, Any], price_history: Any
) -> dict[str, Any]:
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


def _corporate_action_summary(
    corporate_actions_result: dict[str, Any], rows: list[dict[str, Any]]
) -> dict[str, Any]:
    summary = {
        "source": corporate_actions_result.get("source") or "idx_official/yfinance",
        "split": None,
        "rights_issue": None,
    }
    for row in rows or []:
        text = " ".join(
            str(row.get(key) or "") for key in ("type", "action", "event", "description")
        ).lower()
        if "split" in text:
            summary["split"] = row
        if "right" in text or "hmtd" in text:
            summary["rights_issue"] = row
    return summary
