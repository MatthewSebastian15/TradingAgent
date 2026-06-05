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
    if isinstance(value, dict):
        if value.get("available") is False or value.get("status") in {"source_unavailable", "unavailable", "missing"}:
            return False
        if "value" in value:
            return _available(value.get("value"))
    if isinstance(value, str):
        lowered = value.strip().lower()
        if not lowered or lowered.startswith("no ") or " unavailable" in lowered or "not found" in lowered:
            return False
    return True


def calculate_completeness(data: dict[str, Any]) -> dict[str, Any]:
    report: dict[str, Any] = {}
    payload = data or {}
    for group_name, fields in COMPLETENESS_GROUPS.items():
        available_fields = [field for field in fields if _available(payload.get(field))]
        missing_fields = [field for field in fields if field not in available_fields]
        total = len(fields)
        pct = round((len(available_fields) / total) * 100, 2) if total else 0.0
        report[group_name] = {
            "status": "complete" if pct == 100 else "partial" if pct > 0 else "source_unavailable",
            "available_fields": len(available_fields),
            "total_fields": total,
            "missing_fields": missing_fields,
            "completeness_pct": pct,
        }
    overall_total = sum(item["total_fields"] for item in report.values())
    overall_available = sum(item["available_fields"] for item in report.values())
    report["overall"] = {
        "status": "complete" if overall_available == overall_total else "partial" if overall_available else "source_unavailable",
        "available_fields": overall_available,
        "total_fields": overall_total,
        "completeness_pct": round((overall_available / overall_total) * 100, 2) if overall_total else 0.0,
    }
    return report
