"""Per-field freshness policy used by data-quality metadata."""

from __future__ import annotations

import zoneinfo
from datetime import datetime, time as dt_time, timezone
from typing import Any

WIB = zoneinfo.ZoneInfo("Asia/Jakarta")
_IDX_OPEN = dt_time(9, 0)
_IDX_CLOSE = dt_time(16, 0)


def is_market_open_now(market: str = "IDX") -> bool:
    _ = market
    now_wib = datetime.now(WIB)
    if now_wib.weekday() >= 5:
        return False
    return _IDX_OPEN <= now_wib.time() <= _IDX_CLOSE


def effective_ttl(field_name: str) -> int:
    base_ttl = ttl_for_field(field_name)
    if _canonical_field(field_name) in {"quote", "last_price", "technical_indicators"}:
        if not is_market_open_now():
            return 86_400
    return base_ttl

FIELD_TTL_SECONDS: dict[str, int] = {
    "quote": 300,
    "last_price": 300,
    "historical_price": 86_400,
    "technical": 86_400,
    "technical_indicators": 86_400,
    "company_news": 3_600,
    "global_news": 10_800,
    "high_impact_news": 3_600,
    "news_sentiment": 3_600,
    "financial_statement": 604_800,
    "revenue": 604_800,
    "ebitda": 604_800,
    "net_profit": 604_800,
    "balance_sheet": 604_800,
    "cashflow": 604_800,
    "derived_fundamentals": 604_800,
    "shareholders": 604_800,
    "executives": 2_592_000,
    "company_profile": 2_592_000,
    "corporate_actions": 86_400,
    "dividend": 604_800,
    "dividend_quality": 604_800,
}

_FIELD_ALIASES: dict[str, str] = {
    "stock_price": "last_price",
    "ohlcv": "historical_price",
    "financial_metrics": "financial_statement",
    "fundamentals": "financial_statement",
    "income_statement": "financial_statement",
    "social_sentiment": "news_sentiment",
    "insider_transactions": "shareholders",
    "event_risk": "corporate_actions",
    "recommendation_trends": "corporate_actions",
    "sma_20": "technical_indicators",
    "sma_50": "technical_indicators",
    "sma_200": "technical_indicators",
    "volatility": "technical_indicators",
    "rsi": "technical_indicators",
    "rsi_14": "technical_indicators",
    "revenue_growth_percent": "derived_fundamentals",
    "net_profit_growth_percent": "derived_fundamentals",
    "ebitda_margin": "derived_fundamentals",
    "ebitda_margin_percent": "derived_fundamentals",
    "net_profit_margin": "derived_fundamentals",
    "net_profit_margin_percent": "derived_fundamentals",
    "free_cash_flow": "derived_fundamentals",
    "cfo_to_net_income": "derived_fundamentals",
    "net_debt": "derived_fundamentals",
    "dividend_yield": "dividend",
    "dividend_yield_percent": "dividend",
    "payout_ratio": "dividend",
    "payout_ratio_percent": "dividend",
    "fcf_coverage": "dividend",
    "market_cap": "company_profile",
    "sector": "company_profile",
    "industry": "company_profile",
    "country": "company_profile",
    "exchange": "company_profile",
}


def _canonical_field(field_name: str) -> str:
    normalized = str(field_name or "").lower()
    return _FIELD_ALIASES.get(normalized, normalized)


def ttl_for_field(field_name: str, default_seconds: int = 900) -> int:
    return int(FIELD_TTL_SECONDS.get(_canonical_field(field_name), default_seconds))


def parse_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return (
            value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
        )
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        candidates = [text]
        if len(text) >= 10:
            candidates.append(text[:10])
        for candidate in candidates:
            try:
                parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
                return (
                    parsed.astimezone(timezone.utc)
                    if parsed.tzinfo
                    else parsed.replace(tzinfo=timezone.utc)
                )
            except ValueError:
                pass
            try:
                return datetime.strptime(candidate[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                pass
    return None


def _freshness_score(ttl: int | None, age_seconds: int | None, is_stale: bool) -> int:
    if age_seconds is None:
        return 0
    if ttl is None:
        return 25
    if not is_stale:
        return 25
    return max(0, int(25 * (ttl / age_seconds))) if age_seconds else 25


def get_freshness_status(
    field_name: str, as_of: Any, now: datetime | None = None
) -> dict[str, Any]:
    ttl = FIELD_TTL_SECONDS.get(_canonical_field(field_name))
    parsed_as_of = parse_datetime(as_of)
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    else:
        current = current.astimezone(timezone.utc)

    if not parsed_as_of:
        return {
            "field_name": field_name,
            "status": "unknown",
            "is_stale": True,
            "age_seconds": None,
            "ttl_seconds": ttl,
            "as_of_date": None,
            "freshness_score": 0,
            "warnings": ["missing_as_of_date"],
        }

    age_seconds = max(0, int((current - parsed_as_of).total_seconds()))
    is_stale = bool(ttl is not None and age_seconds > ttl)
    warnings = ["Data is stale based on field freshness policy"] if is_stale else []

    return {
        "field_name": field_name,
        "status": "stale" if is_stale else "fresh",
        "is_stale": is_stale,
        "age_seconds": age_seconds,
        "ttl_seconds": ttl,
        "as_of_date": parsed_as_of.isoformat(),
        "freshness_score": _freshness_score(ttl, age_seconds, is_stale),
        "warnings": warnings,
    }


_parse_datetime = parse_datetime
