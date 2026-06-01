from __future__ import annotations

import csv
import json
import logging
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from io import StringIO
from typing import Any, TypeVar

from tradingagents.dataflows.config import get_config, set_config, use_config
from tradingagents.dataflows.data_quality import DataField, DataQualityReport, extract_price_dates, looks_missing
from tradingagents.dataflows.interface import route_to_all_vendors, route_to_vendor
from tradingagents.dataflows.news_service import NewsService, format_news_for_prompt
from tradingagents.dataflows.vendor_budget import create_budget_from_config, release_budget
from tradingagents.dataflows.vendor_router import create_attempt_recorder, release_attempt_recorder
from tradingagents.dataflows.y_finance import normalize_ticker
from tradingagents.financial_highlights.builder import build_financial_highlights
from tradingagents.financial_highlights.models import to_dict as financial_highlights_to_dict
from tradingagents.pipeline_balanced_types import AnalysisCancelledError, CollectedData

logger = logging.getLogger(__name__)

T = TypeVar("T")
VALID_TIME_HORIZON_MONTHS = {1, 2, 3}


def _quality_warning(code: str, severity: str, message: str, blocking: bool = False) -> dict[str, Any]:
    return {"code": code, "severity": severity, "message": message, "blocking": blocking}


def _warning_detail_from_message(message: str) -> dict[str, Any]:
    lowered = message.lower()
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
    return _horizon_days(time_horizon_months) + 30


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


def _safe_data_field(label: str, func: Callable[[], Any], limit: int = 12_000) -> DataField:
    try:
        raw_value = _call_yfinance_with_resilience(func)
        if isinstance(raw_value, DataField):
            return raw_value
        return DataField.from_text(_truncate(raw_value, limit))
    except Exception as exc:
        logger.warning("Balanced pipeline data call failed for %s: %s", label, exc)
        return DataField.unavailable(label, exc)


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


def _fetch_news_field(method: str, *args) -> Any:
    config = get_config()
    if bool(config.get("data_vendor_enable_multi_source_news", False)):
        return route_to_all_vendors(method, *args)
    return route_to_vendor(method, *args)


def _safe_news_data_field(label: str, method: str, *args, limit: int = 12_000) -> DataField:
    config = get_config()
    if bool(config.get("data_vendor_enable_multi_source_news", False)):
        return _safe_multi_source_data_field(label, lambda: route_to_all_vendors(method, *args), limit=limit)
    return _safe_data_field(label, lambda: route_to_vendor(method, *args), limit=limit)


def _safe_structured_company_news(
    ticker: str,
    trade_date: str,
    window_days: int,
    holder: dict[str, Any],
    *,
    limit: int = 12_000,
) -> DataField:
    try:
        context = NewsService().fetch_news(ticker, as_of_date=trade_date, window_days=window_days)
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


def _safe_company_profile(ticker: str, trade_date: str) -> dict[str, Any]:
    try:
        return route_to_vendor("get_company_profile", ticker, trade_date)
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


def _extract_last_close_price_and_date(price_data: str, trade_date: str) -> tuple[float | None, str | None]:
    """Parse the last Close value and row date at or before trade_date from yfinance CSV."""
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
    return last_close, last_date.strftime("%Y-%m-%d") if last_date is not None else None


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


def _build_price_chart(
    ticker: str,
    trade_date: str,
    price_data: str,
    time_horizon_months: int,
    source: str | None = None,
) -> dict[str, Any]:
    """Build frontend-ready OHLCV chart data from collected CSV price data."""
    months = _normalize_time_horizon_months(time_horizon_months)
    lookback_days = _price_lookback_days(months)
    window_label = f"{months} Month{'s' if months > 1 else ''} Analysis / {lookback_days}D Price Window"

    base_payload: dict[str, Any] = {
        "available": False,
        "source": source or "unavailable",
        "ticker": ticker,
        "trade_date": trade_date,
        "window_label": window_label,
        "lookback_days": lookback_days,
        "points": [],
        "stats": {},
    }

    lines = [
        line
        for line in (price_data or "").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not lines:
        return {**base_payload, "warning": "Price chart data is unavailable."}

    try:
        cutoff = datetime.strptime(trade_date, "%Y-%m-%d")
        start_cutoff = cutoff - timedelta(days=lookback_days)
    except ValueError:
        cutoff = None
        start_cutoff = None

    points: list[dict[str, Any]] = []

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

            if cutoff is not None and row_date > cutoff:
                continue
            if start_cutoff is not None and row_date < start_cutoff:
                continue

            open_price = _safe_float(row.get("Open"))
            high_price = _safe_float(row.get("High"))
            low_price = _safe_float(row.get("Low"))
            close_price = _safe_float(row.get("Close") or row.get("Adj Close"))
            if any(value is None for value in [open_price, high_price, low_price, close_price]):
                continue

            points.append(
                {
                    "date": row_date.strftime("%Y-%m-%d"),
                    "open": open_price,
                    "high": max(high_price, open_price, close_price, low_price),
                    "low": min(low_price, open_price, close_price, high_price),
                    "close": close_price,
                    "volume": _safe_int(row.get("Volume")),
                }
            )
    except Exception as exc:
        logger.warning("Failed to build price chart for %s: %s", ticker, exc)
        return {**base_payload, "warning": "Price chart data could not be parsed."}

    points = sorted(points, key=lambda item: item["date"])

    if not points:
        return {**base_payload, "warning": "No usable price rows were available for the selected window."}

    closes = [float(item["close"]) for item in points if item.get("close") is not None]
    highs = [float(item["high"]) for item in points if item.get("high") is not None]
    lows = [float(item["low"]) for item in points if item.get("low") is not None]
    volumes = [int(item["volume"]) for item in points if item.get("volume") is not None]

    start_price = closes[0] if closes else None
    end_price = closes[-1] if closes else None
    change = end_price - start_price if start_price is not None and end_price is not None else None
    change_percent = (change / start_price * 100) if change is not None and start_price else None

    stats = {
        "start_price": start_price,
        "end_price": end_price,
        "change": change,
        "change_percent": round(change_percent, 2) if change_percent is not None else None,
        "high": max(highs) if highs else None,
        "low": min(lows) if lows else None,
        "average_close": round(sum(closes) / len(closes), 2) if closes else None,
        "average_volume": round(sum(volumes) / len(volumes)) if volumes else None,
        "point_count": len(points),
    }

    return {
        **base_payload,
        "available": True,
        "source": source or "yfinance",
        "points": points,
        "stats": stats,
    }


def _date_window(trade_date: str, time_horizon_months: int = 1) -> tuple[str, str, str]:
    current = datetime.strptime(trade_date, "%Y-%m-%d")
    start_price = (current - timedelta(days=_price_lookback_days(time_horizon_months))).strftime("%Y-%m-%d")
    start_news = (current - timedelta(days=_horizon_days(time_horizon_months))).strftime("%Y-%m-%d")
    end = (current + timedelta(days=1)).strftime("%Y-%m-%d")
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
            lambda: route_to_vendor("get_stock_data", ticker, start_price, end),
            limit=14_000,
        ),
        "fundamentals": lambda: _safe_data_field(
            "fundamentals",
            lambda: route_to_vendor("get_fundamentals", ticker, trade_date),
            limit=12_000,
        ),
        "balance_sheet": lambda: _safe_data_field(
            "balance_sheet",
            lambda: route_to_vendor("get_balance_sheet", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "cashflow": lambda: _safe_data_field(
            "cashflow",
            lambda: route_to_vendor("get_cashflow", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "income_statement": lambda: _safe_data_field(
            "income_statement",
            lambda: route_to_vendor("get_income_statement", ticker, "quarterly", trade_date),
            limit=10_000,
        ),
        "insider_transactions": lambda: _safe_data_field(
            "insider_transactions",
            lambda: route_to_vendor("get_insider_transactions", ticker),
            limit=6_000,
        ),
        "news_sentiment": lambda: _safe_data_field(
            "news_sentiment",
            lambda: route_to_vendor("get_news_sentiment", ticker),
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
        limit=8_000,
    )
    return tasks


def _run_collection_tasks(
    tasks: dict[str, Callable[[], DataField]],
    config: dict[str, Any],
    cancel_check: Callable[[], bool] | None,
) -> dict[str, DataField]:
    results: dict[str, DataField] = {}
    max_workers = min(max(1, int(config.get("data_collection_workers", 6))), len(tasks))
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
) -> str:
    price_dates = extract_price_dates(price.value)
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
            warnings.append(
                "OHLCV_FALLBACK_USED - Exact OHLCV date not found; "
                f"using latest available trading day {fallback_date}."
            )
            return "market_closed"
        warnings.append(
            "OHLCV_MISSING - No available OHLCV row found on or before "
            f"{trade_date}; current price cannot be validated."
        )
        return "missing"
    if len(price_dates) < 10:
        warnings.append(f"Only {len(price_dates)} price rows found in the {price_lookback_days}-day configured vendor window.")
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
        warnings.append("NEWS_UNAVAILABLE - No usable company-specific or global news was returned; analysis continues without blocking trade validation.")
        return "unavailable"
    if company_news.status == "missing" or global_news.status == "missing":
        warnings.append("NEWS_PARTIAL - Partial news coverage from configured vendors; company-specific or global news is missing.")
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
    price_status = _classify_price_data(price, fundamentals, trade_date, price_lookback_days, warnings)
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
    vendor_attempts: dict[str, list[str]] | None = None,
    request_budget: dict[str, Any] | None = None,
) -> tuple[dict[str, str], list[str], dict[str, Any]]:
    data_sources = {
        "quote": "routed:yfinance->finnhub->alpha_vantage",
        "price": _price_source_label(price.value, last_close_price) or "unavailable",
        "ohlcv": _source_label(price.value),
        "technical": "configured_ohlcv:local_calculation",
        "fundamental_profile_metrics": _source_label(fundamentals.value),
        "balance_sheet": _source_label(balance_sheet.value),
        "cashflow": _source_label(cashflow.value),
        "income_statement": _source_label(income_statement.value),
        "company_news": _source_label(company_news.value),
        "global_news": _source_label(global_news.value),
        "news": "+".join(dict.fromkeys(_detect_sources_from_text(company_news.value) + _detect_sources_from_text(global_news.value))) or "unavailable",
        "news_sentiment": _source_label(news_sentiment.value),
        "social_sentiment": _source_label(social_sentiment.value),
        "event_risk": _source_label(event_risk.value),
        "recommendation_trends": _source_label(recommendation_trends.value),
        "insider": _source_label(insider_transactions.value, default="disabled_or_unavailable"),
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
    tasks = _build_collection_tasks(
        ticker,
        trade_date,
        start_price,
        start_news,
        end,
        news_lookback_days,
        news_context_holder=news_context,
    )
    results = _run_collection_tasks(tasks, config, cancel_check)
    annual_statement_results = _run_collection_tasks(
        {
            "annual_balance_sheet": lambda: _safe_data_field(
                "annual_balance_sheet",
                lambda: route_to_vendor("get_balance_sheet", ticker, "annual", trade_date),
                limit=10_000,
            ),
            "annual_income_statement": lambda: _safe_data_field(
                "annual_income_statement",
                lambda: route_to_vendor("get_income_statement", ticker, "annual", trade_date),
                limit=10_000,
            ),
        },
        config,
        cancel_check,
    )

    price = results["price_data"]
    fundamentals = results["fundamentals"]
    balance_sheet = results["balance_sheet"]
    cashflow = results["cashflow"]
    income_statement = results["income_statement"]
    annual_balance_sheet = annual_statement_results["annual_balance_sheet"]
    annual_income_statement = annual_statement_results["annual_income_statement"]
    company_profile = _safe_company_profile(ticker, trade_date)
    company_news = results["company_news"]
    global_news = results["global_news"]
    insider_transactions = results["insider_transactions"]
    news_sentiment = results.get("news_sentiment", DataField.from_text(""))
    social_sentiment = results.get("social_sentiment", DataField.from_text(""))
    event_risk = results.get("event_risk", DataField.from_text(""))
    recommendation_trends = results.get("recommendation_trends", DataField.from_text(""))
    technical_indicators = _safe_local_indicator_field(price)
    all_fields = [
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
        technical_indicators,
    ]
    data_quality = _build_data_quality(
        trade_date,
        price,
        fundamentals,
        balance_sheet,
        cashflow,
        income_statement,
        company_news,
        global_news,
        all_fields,
        price_lookback,
    )

    _check_cancel(cancel_check)
    last_close_price, last_close_price_as_of = _extract_last_close_price_and_date(price.value, trade_date)
    price_chart = _build_price_chart(
        ticker=ticker,
        trade_date=trade_date,
        price_data=price.value,
        time_horizon_months=time_horizon_months,
        source=_price_source_label(price.value, last_close_price) or "yfinance",
    )
    vendor_attempts = attempt_recorder.get_summary()
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
        vendor_attempts=vendor_attempts,
        request_budget=request_budget,
    )
    financial_highlights = None
    try:
        financial_highlights = financial_highlights_to_dict(
            build_financial_highlights(
                ticker=ticker,
                analysis_date=trade_date,
                fundamentals=fundamentals.value,
                income_statement={"quarterly": income_statement.value, "annual": annual_income_statement.value},
                balance_sheet={"quarterly": balance_sheet.value, "annual": annual_balance_sheet.value},
                cashflow=cashflow.value,
                price_data=price.value,
            )
        )
    except Exception:
        logger.exception("Failed to build financial highlights for %s", ticker)
    try:
        release_budget(budget_id)
        release_attempt_recorder(attempt_id)
    except Exception:
        pass
    return CollectedData(
        ticker=ticker,
        trade_date=trade_date,
        time_horizon_months=time_horizon_months,
        price_data=price.value,
        technical_indicators=technical_indicators.value,
        fundamentals=fundamentals.value,
        balance_sheet=balance_sheet.value,
        cashflow=cashflow.value,
        income_statement=income_statement.value,
        company_news=company_news.value,
        global_news=global_news.value,
        insider_transactions=insider_transactions.value,
        news_sentiment=news_sentiment.value,
        social_sentiment=social_sentiment.value,
        event_risk=event_risk.value,
        recommendation_trends=recommendation_trends.value,
        data_quality=data_quality,
        last_close_price=last_close_price,
        last_close_price_as_of=last_close_price_as_of or trade_date,
        last_close_price_source=data_sources.get("price") if last_close_price is not None else None,
        company_profile=company_profile,
        price_chart=price_chart,
        news_context=news_context,
        data_sources=data_sources,
        data_limitations=data_limitations,
        vendor_attempts=runtime_metadata.get("vendor_attempts", {}),
        request_budget=runtime_metadata.get("request_budget", {}),
        financial_highlights=financial_highlights,
    )
