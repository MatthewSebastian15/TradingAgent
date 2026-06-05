"""Completeness reporting for collected analysis data."""

from __future__ import annotations

from typing import Any

COMPLETENESS_GROUPS: dict[str, list[str]] = {
    "price_data": ["quote", "historical_price", "market_cap", "volume"],
    "fundamental_data": ["revenue", "ebitda", "net_profit", "assets", "equity", "cashflow"],
    "news_data": ["company_news", "global_news", "high_impact_news"],
    "sentiment_data": ["news_sentiment", "social_sentiment"],
    "profile_data": ["company_profile", "executives", "shareholders"],
    "corporate_action_data": ["dividend", "split", "rights_issue"],
}

_MISSING_VALUES = (None, "", "N/A", "n/a", [], {})


def _available(value: Any) -> bool:
    if value in _MISSING_VALUES:
        return False
    if isinstance(value, str):
        lowered = value.strip().lower()
        if not lowered or lowered.startswith("no ") or " unavailable" in lowered or "not found" in lowered:
            return False
    return True


def calculate_completeness(data: dict[str, Any]) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for group_name, fields in COMPLETENESS_GROUPS.items():
        available = sum(1 for field in fields if _available((data or {}).get(field)))
        total = len(fields)
        report[group_name] = {
            "available_fields": available,
            "total_fields": total,
            "completeness_pct": round((available / total) * 100, 2) if total else 0,
        }
    return report
