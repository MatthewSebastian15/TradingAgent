from __future__ import annotations

import csv
import json
import math
from io import StringIO
from statistics import mean
from typing import Any


def safe_json_dumps(value: Any, *, max_chars: int | None = None) -> str:
    text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
    if max_chars is not None and len(text) > max_chars:
        return text[:max_chars].rstrip() + "\n[TRUNCATED_FOR_PROMPT_CONTEXT]"
    return text


def parse_ohlcv_csv(price_data: str) -> list[dict[str, Any]]:
    lines = [line for line in (price_data or "").splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if not lines:
        return []

    rows: list[dict[str, Any]] = []
    reader = csv.DictReader(StringIO("\n".join(lines)))
    for raw in reader:
        date = (raw.get("Date") or raw.get("") or "").strip()
        close = _to_float(raw.get("Close") or raw.get("Adj Close"))
        open_ = _to_float(raw.get("Open"))
        high = _to_float(raw.get("High"))
        low = _to_float(raw.get("Low"))
        volume = _to_float(raw.get("Volume"))
        if not date or close is None:
            continue
        rows.append(
            {
                "date": date[:10],
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )
    return rows


def build_market_context(data: Any, *, recent_candle_limit: int = 10) -> dict[str, Any]:
    rows = parse_ohlcv_csv(data.price_data)
    closes = [row["close"] for row in rows if row.get("close") is not None]
    volumes = [row["volume"] for row in rows if row.get("volume") is not None]
    high_values = [row["high"] for row in rows if row.get("high") is not None]
    low_values = [row["low"] for row in rows if row.get("low") is not None]
    last = rows[-1] if rows else {}
    last_close = last.get("close") or data.last_close_price

    return {
        "ticker": data.ticker,
        "trade_date": data.trade_date,
        "time_horizon_months": data.time_horizon_months,
        "last_close": last_close,
        "last_close_as_of": data.last_close_price_as_of,
        "price_source": data.last_close_price_source,
        "rows_available": len(rows),
        "window_start": rows[0]["date"] if rows else None,
        "window_end": rows[-1]["date"] if rows else None,
        "returns_percent": {
            "5d": _pct_change(closes[-6], closes[-1]) if len(closes) >= 6 else None,
            "20d": _pct_change(closes[-21], closes[-1]) if len(closes) >= 21 else None,
            "60d": _pct_change(closes[-61], closes[-1]) if len(closes) >= 61 else None,
        },
        "window_high": max(high_values) if high_values else None,
        "window_low": min(low_values) if low_values else None,
        "average_volume_20d": round(mean(volumes[-20:]), 2) if volumes else None,
        "recent_candles": rows[-recent_candle_limit:],
        "price_chart_summary": _compact_price_chart(data.price_chart),
        "price_performance": _compact_mapping(data.price_performance, max_items=12),
        "technical_entry": _compact_mapping(data.technical_entry, max_items=20),
        "technical_indicators": _compact_text_block(data.technical_indicators, max_chars=3500),
        "data_quality": _model_dump(data.data_quality),
    }


def build_news_context(data: Any, *, max_company_items: int = 5, max_macro_items: int = 3) -> dict[str, Any]:
    related_items = []
    if isinstance(data.related_news, dict):
        related_items = data.related_news.get("items") or []

    normalized_items = []
    for item in related_items[: max_company_items + max_macro_items]:
        if not isinstance(item, dict):
            continue
        normalized_items.append(
            {
                "title": item.get("title"),
                "publisher": item.get("publisher"),
                "published_at": item.get("published_at"),
                "source": item.get("source"),
                "event_type": item.get("event_type"),
                "summary": _compact_text_block(item.get("summary", ""), max_chars=450),
                "relevance_reason": _compact_text_block(item.get("relevance_reason", ""), max_chars=280),
                "url": item.get("url"),
            }
        )

    news_context = data.news_context if isinstance(data.news_context, dict) else {}
    return {
        "ticker": data.ticker,
        "trade_date": data.trade_date,
        "time_horizon_months": data.time_horizon_months,
        "provider_status": news_context.get("provider_status"),
        "providers_used": news_context.get("providers_used"),
        "articles_found": news_context.get("articles_found"),
        "articles_used_in_prompt": news_context.get("articles_used_in_prompt"),
        "average_sentiment": news_context.get("average_sentiment"),
        "related_news_summary": (data.related_news or {}).get("summary") if isinstance(data.related_news, dict) else None,
        "top_related_news": normalized_items,
        "news_impact": _compact_mapping(data.news_impact, max_items=12),
        "catalyst_tracker": _compact_mapping(data.catalyst_tracker, max_items=12),
        "analyst_consensus": _compact_mapping(data.analyst_consensus, max_items=12),
        "insider_transactions": _compact_text_block(data.insider_transactions, max_chars=1800),
        "news_sentiment": _compact_text_block(data.news_sentiment, max_chars=1500),
        "social_sentiment": _compact_text_block(data.social_sentiment, max_chars=1500),
        "company_news_sample": _compact_text_block(data.company_news, max_chars=2200),
        "global_news_sample": _compact_text_block(data.global_news, max_chars=1400),
        "data_quality": _model_dump(data.data_quality),
    }


def build_fundamentals_context(data: Any) -> dict[str, Any]:
    profile = data.company_profile if isinstance(data.company_profile, dict) else {}
    return {
        "ticker": data.ticker,
        "trade_date": data.trade_date,
        "time_horizon_months": data.time_horizon_months,
        "company_profile": {
            "available": profile.get("available"),
            "company_name": profile.get("company_name"),
            "exchange": profile.get("exchange"),
            "currency": profile.get("currency"),
            "country": profile.get("country"),
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "market_cap": profile.get("market_cap"),
            "shares_outstanding": profile.get("shares_outstanding"),
            "current_price": profile.get("current_price"),
            "business_summary": _compact_text_block(profile.get("business_summary", ""), max_chars=900),
            "data_quality": profile.get("data_quality"),
        },
        "financial_highlights": _compact_financial_highlights(data.financial_highlights),
        "fundamental_analysis": _compact_mapping(data.fundamental_analysis, max_items=16),
        "event_risk": _compact_text_block(data.event_risk, max_chars=1200),
        "recommendation_trends": _compact_text_block(data.recommendation_trends, max_chars=1200),
        "fundamentals_sample": _compact_text_block(data.fundamentals, max_chars=2200),
        "balance_sheet_sample": _compact_text_block(data.balance_sheet, max_chars=1800),
        "cashflow_sample": _compact_text_block(data.cashflow, max_chars=1800),
        "income_statement_sample": _compact_text_block(data.income_statement, max_chars=1800),
        "data_quality": _model_dump(data.data_quality),
    }


def build_prompt_context(data: Any) -> dict[str, Any]:
    return {
        "market": build_market_context(data),
        "news_social": build_news_context(data),
        "fundamentals": build_fundamentals_context(data),
    }


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        number = float(str(value).replace(",", ""))
        if math.isnan(number) or math.isinf(number):
            return None
        return number
    except (TypeError, ValueError):
        return None


def _pct_change(start: float | None, end: float | None) -> float | None:
    if start is None or end is None or start == 0:
        return None
    return round(((end - start) / start) * 100, 2)


def _compact_price_chart(price_chart: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(price_chart, dict):
        return {"available": False}
    points = price_chart.get("points") or []
    return {
        "available": bool(price_chart.get("available", bool(price_chart))),
        "summary": price_chart.get("summary"),
        "source": price_chart.get("source"),
        "currency": price_chart.get("currency"),
        "points_count": len(points),
        "latest_point": points[-1] if points else None,
    }


def _compact_financial_highlights(value: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"available": False}
    return {
        "available": bool(value),
        "currency": value.get("currency"),
        "scale": value.get("scale"),
        "analysis_date": value.get("analysis_date"),
        "periods": value.get("periods"),
        "point_in_time": value.get("point_in_time"),
        "rows": _compact_list(value.get("rows"), max_items=24),
        "notes": value.get("notes"),
        "data_quality": value.get("data_quality"),
    }


def _compact_mapping(value: Any, *, max_items: int) -> Any:
    if isinstance(value, dict):
        compact: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= max_items:
                compact["truncated"] = True
                break
            compact[key] = _compact_mapping(item, max_items=max_items)
        return compact
    if isinstance(value, list):
        return _compact_list(value, max_items=max_items)
    if isinstance(value, str):
        return _compact_text_block(value, max_chars=900)
    return value


def _compact_list(value: Any, *, max_items: int) -> list[Any]:
    if not isinstance(value, list):
        return []
    return [_compact_mapping(item, max_items=max_items) for item in value[:max_items]]


def _compact_text_block(value: Any, *, max_chars: int) -> str:
    text = "\n".join(line.rstrip() for line in str(value or "").splitlines() if line.strip())
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n[TRUNCATED_FOR_PROMPT_CONTEXT]"


def _model_dump(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value if isinstance(value, dict) else {}

