"""Map fundamental gaps to reasoned fallback plans."""

from __future__ import annotations

from typing import Any

GAP_RULES: dict[str, dict[str, str]] = {
    "dividend_yield": {"impact": "medium", "fallback": "dividend_source"},
    "payout_ratio": {"impact": "low", "fallback": "dividend_source + net_profit"},
    "fcf_coverage": {"impact": "medium", "fallback": "cashflow + dividends"},
    "cfo_to_net_income": {"impact": "medium", "fallback": "cashflow + income_statement"},
    "free_cash_flow": {"impact": "medium", "fallback": "operating_cash_flow - capex"},
    "revenue_growth_percent": {"impact": "high", "fallback": "annual revenue FY current and previous"},
    "net_profit_growth_percent": {"impact": "high", "fallback": "annual net profit FY current and previous"},
    "ebitda_margin": {"impact": "medium", "fallback": "ebitda / revenue"},
    "net_profit_margin": {"impact": "medium", "fallback": "net_profit / revenue"},
    "sma_50": {"impact": "medium", "fallback": "historical_price"},
    "sma_200": {"impact": "medium", "fallback": "historical_price"},
}

_MISSING_STRINGS = {"", "n/a", "na", "none", "null", "unavailable", "source_unavailable", "missing"}
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
_MISSING_STATUSES = {"source_unavailable", "unavailable", "missing", "failed", "empty"}


def _lookup(payload: dict[str, Any], dotted_key: str) -> Any:
    current: Any = payload
    for part in dotted_key.split("."):
        if isinstance(current, dict):
            current = current.get(part)
            continue
        return None
    return current


def _first_present(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _latest_derived(payload: dict[str, Any], field: str) -> Any:
    derived = payload.get("derived_fundamentals") or _lookup(payload, "financial_highlights.derived_fundamentals")
    if isinstance(derived, list) and derived:
        for row in reversed(derived):
            if not isinstance(row, dict):
                continue
            metrics = row.get("derived_metrics") if isinstance(row.get("derived_metrics"), dict) else row
            if field in metrics:
                return metrics.get(field)
    if isinstance(derived, dict):
        metrics = derived.get("derived_metrics") if isinstance(derived.get("derived_metrics"), dict) else derived
        return metrics.get(field)
    return None


def _dividend_value(payload: dict[str, Any], field: str) -> Any:
    dividend = payload.get("dividend_quality") or {}
    aliases = {
        "dividend_yield": ("dividend_yield", "dividend_yield_percent"),
        "payout_ratio": ("payout_ratio", "payout_ratio_percent"),
        "fcf_coverage": ("fcf_coverage",),
    }
    if not isinstance(dividend, dict):
        return None
    return _first_present(*(dividend.get(alias) for alias in aliases.get(field, (field,))))


def _technical_value(payload: dict[str, Any], field: str) -> Any:
    return _first_present(payload.get(field), _lookup(payload, f"technical_entry.{field}"))


def _statement_value(payload: dict[str, Any], field: str) -> Any:
    aliases = {
        "free_cash_flow": ("cashflow.free_cash_flow", "annual_cashflow.free_cash_flow"),
        "cfo_to_net_income": ("cashflow.operating_cash_flow", "cashflow.cash_from_operations"),
    }
    for key in aliases.get(field, (field,)):
        value = _lookup(payload, key) if "." in key else payload.get(key)
        if value is not None:
            return value
    return None


def _candidate_value(payload: dict[str, Any], field: str) -> Any:
    return _first_present(
        payload.get(field),
        _latest_derived(payload, field),
        _dividend_value(payload, field),
        _technical_value(payload, field),
        _statement_value(payload, field),
    )


def _available(value: Any, *, field: str | None = None) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, (int, float)):
        return value == value
    if isinstance(value, str):
        return value.strip().lower() not in _MISSING_STRINGS
    if isinstance(value, (list, tuple, set)):
        return bool(value)
    if isinstance(value, dict):
        status = str(value.get("status") or value.get("dividend_status") or "").strip().lower()
        if field in {"dividend_yield", "payout_ratio", "fcf_coverage"} and status in {
            "no_dividend_history",
            "not_applicable_negative_earnings",
            "not_applicable",
        }:
            return True
        if status in _AVAILABLE_STATUSES:
            if "value" in value:
                return _available(value.get("value"), field=field) or status in {"calculated", "not_applicable", "no_dividend_history", "not_applicable_negative_earnings"}
            return True
        if status in _MISSING_STATUSES or value.get("available") is False:
            return False
        if "value" in value:
            return _available(value.get("value"), field=field)
        if "normalized_value" in value:
            return _available(value.get("normalized_value"), field=field)
        return any(_available(item, field=field) for item in value.values())
    return True


def _missing_reason(field: str, payload: dict[str, Any]) -> str:
    if field in {"sma_50", "sma_200"}:
        indicator = _lookup(payload, f"technical_entry.{field}")
        if isinstance(indicator, dict) and indicator.get("reason"):
            return str(indicator["reason"])
        return "vendor technical indicator and historical-price fallback are unavailable"
    if field in {"dividend_yield", "payout_ratio", "fcf_coverage"}:
        dividend = payload.get("dividend_quality") or {}
        if isinstance(dividend, dict) and dividend.get("reason"):
            return str(dividend["reason"])
        return "dividend source, net profit, or cashflow data unavailable"
    if field in {"revenue_growth_percent", "net_profit_growth_percent"}:
        return "current and previous annual normalized financial rows are required"
    if field in {"ebitda_margin", "net_profit_margin"}:
        return "revenue and profit metric are required"
    if field == "free_cash_flow":
        return "cashflow or capex unavailable"
    if field == "cfo_to_net_income":
        return "operating cashflow or net income unavailable"
    return "required fundamental input unavailable"


def map_fundamental_gaps(fundamental_payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = fundamental_payload or {}
    gaps: list[dict[str, Any]] = []
    available_fields: list[str] = []
    missing_fields: list[str] = []

    for field, meta in GAP_RULES.items():
        value = _candidate_value(payload, field)
        if _available(value, field=field):
            available_fields.append(field)
            continue
        missing_fields.append(field)
        gaps.append(
            {
                "field": field,
                "status": "missing",
                "impact": meta["impact"],
                "reason": _missing_reason(field, payload),
                "recommended_fallback": meta["fallback"],
            }
        )

    critical_missing_count = sum(1 for gap in gaps if gap.get("impact") == "high")
    recommended_actions = [
        f"{gap['field']}: use {gap['recommended_fallback']}" for gap in gaps
    ]
    return {
        "status": "complete" if not gaps else "partial" if available_fields else "source_unavailable",
        "missing_count": len(gaps),
        "available_count": len(available_fields),
        "critical_missing_count": critical_missing_count,
        "missing_fields": missing_fields,
        "available_fields": available_fields,
        "recommended_actions": recommended_actions,
        "gaps": gaps,
    }
