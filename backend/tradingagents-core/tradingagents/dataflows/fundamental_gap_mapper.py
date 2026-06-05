"""Map fundamental gaps to reasoned fallback plans."""

from __future__ import annotations

from typing import Any

GAP_RULES: dict[str, dict[str, str]] = {
    "dividend_yield": {"impact": "medium", "fallback": "dividend_source"},
    "payout_ratio": {"impact": "low", "fallback": "dividend_source + net_profit"},
    "fcf_coverage": {"impact": "medium", "fallback": "cashflow + dividends"},
    "cfo_to_net_income": {"impact": "medium", "fallback": "cashflow + income_statement"},
    "free_cash_flow": {"impact": "medium", "fallback": "cashflow - capex"},
    "revenue_growth_percent": {"impact": "medium", "fallback": "current_revenue + previous_revenue"},
    "net_profit_growth_percent": {"impact": "medium", "fallback": "current_net_profit + previous_net_profit"},
    "sma_50": {"impact": "medium", "fallback": "historical_price"},
    "sma_200": {"impact": "medium", "fallback": "historical_price"},
}


def _lookup(payload: dict[str, Any], dotted_key: str) -> Any:
    current: Any = payload
    for part in dotted_key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def map_fundamental_gaps(fundamental_payload: dict[str, Any]) -> dict[str, Any]:
    payload = fundamental_payload or {}
    gaps: list[dict[str, Any]] = []
    for field, meta in GAP_RULES.items():
        value = payload.get(field)
        if value is None and field in {"sma_50", "sma_200"}:
            value = _lookup(payload, f"technical_entry.{field}")
        if value in (None, "", "N/A"):
            gaps.append(
                {
                    "field": field,
                    "status": "missing",
                    "impact": meta["impact"],
                    "recommended_fallback": meta["fallback"],
                }
            )
    return {"missing_count": len(gaps), "gaps": gaps}
