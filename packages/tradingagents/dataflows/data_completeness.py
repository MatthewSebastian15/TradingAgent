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
    "technical_data": ["sma_20", "sma_50", "sma_200", "volatility"],
    "valuation_data": ["pe_ratio", "pb_ratio", "ev_ebitda", "fair_value_range"],
    "risk_data": ["leverage", "drawdown", "liquidity", "beta"],
}

_MISSING_STRINGS = {"", "n/a", "na", "none", "null", "unavailable", "source_unavailable", "missing"}
_UNAVAILABLE_STATUSES = {"source_unavailable", "unavailable", "missing", "failed", "empty"}
_AVAILABLE_STATUSES = {
    "available",
    "calculated",
    "reported",
    "estimated",
    "partial",
    "no_dividend_history",
    "not_applicable",
    "not_applicable_negative_earnings",
    "no_history",
}


class FieldList(list):
    """List payload that also supports legacy count comparisons."""

    def _compare_len(self, other: object, op) -> bool:
        if isinstance(other, int):
            return op(len(self), other)
        return NotImplemented

    def __ge__(self, other: object) -> bool:
        return self._compare_len(other, lambda left, right: left >= right)

    def __gt__(self, other: object) -> bool:
        return self._compare_len(other, lambda left, right: left > right)

    def __le__(self, other: object) -> bool:
        return self._compare_len(other, lambda left, right: left <= right)

    def __lt__(self, other: object) -> bool:
        return self._compare_len(other, lambda left, right: left < right)


def _available(value: Any) -> bool:
    """Return True when a payload value is usable or explicitly explained.

    ``no_dividend_history`` is intentionally counted as available for dividend
    completeness: the data says "no dividend", not "we lost the dividend in a
    spreadsheet swamp". Small mercy.
    """
    if value is None:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return value == value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in _MISSING_STRINGS:
            return False
        return not (
            lowered.startswith("no ") or " unavailable" in lowered or "not found" in lowered
        )
    if isinstance(value, (list, tuple, set)):
        return len(value) > 0
    if isinstance(value, dict):
        status = str(value.get("status") or value.get("dividend_status") or "").strip().lower()
        if status in _AVAILABLE_STATUSES:
            return True
        if status in _UNAVAILABLE_STATUSES or value.get("available") is False:
            # Explicit no-history statuses above are not treated as failures.
            return False
        if "value" in value:
            return _available(value.get("value"))
        if "normalized_value" in value:
            return _available(value.get("normalized_value"))
        return any(_available(item) for item in value.values())
    return True


def _build_group(payload: dict[str, Any], fields: list[str]) -> dict[str, Any]:
    available_fields = FieldList(field for field in fields if _available(payload.get(field)))
    missing_fields = [field for field in fields if field not in available_fields]
    total = len(fields)
    available_count = len(available_fields)
    pct = round((available_count / total) * 100, 2) if total else 0.0
    status = "complete" if pct == 100 else "partial" if pct > 0 else "source_unavailable"
    return {
        "status": status,
        "available_count": available_count,
        "total_count": total,
        "available_fields": available_fields,
        "missing_fields": missing_fields,
        "completeness_pct": pct,
        "completeness_percent": pct,
        # Backward-compatible aliases for older serializers/tests.
        "available_field_count": available_count,
        "total_fields": total,
    }


def calculate_completeness(data: dict[str, Any] | None) -> dict[str, Any]:
    payload = data or {}
    groups = {
        group_name: _build_group(payload, fields)
        for group_name, fields in COMPLETENESS_GROUPS.items()
    }
    overall_total = sum(item["total_count"] for item in groups.values())
    overall_available = sum(item["available_count"] for item in groups.values())
    overall_pct = round((overall_available / overall_total) * 100, 2) if overall_total else 0.0
    overall = {
        "status": "complete"
        if overall_available == overall_total
        else "partial"
        if overall_available
        else "source_unavailable",
        "available_count": overall_available,
        "total_count": overall_total,
        "available_fields": [
            field for group in groups.values() for field in group["available_fields"]
        ],
        "missing_fields": [field for group in groups.values() for field in group["missing_fields"]],
        "completeness_pct": overall_pct,
        "completeness_percent": overall_pct,
        "available_field_count": overall_available,
        "total_fields": overall_total,
    }
    # Keep historical top-level group access while also exposing a canonical groups object.
    return {**groups, "groups": groups, "overall": overall}
