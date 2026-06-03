from __future__ import annotations

from typing import Any


def _trend(values: list[float | None], *, lower_is_better: bool = False) -> str:
    available = [float(value) for value in values if isinstance(value, (int, float))]
    if len(available) < 2:
        return "N/A"
    change = available[-1] - available[0]
    if abs(change) <= 0.5:
        return "stable"
    improving = change < 0 if lower_is_better else change > 0
    return "improving" if improving else "weakening"


def build_financial_trends(financial_highlights: dict[str, Any] | None) -> dict[str, Any]:
    highlights = financial_highlights or {}
    periods = list(highlights.get("periods") or [])
    rows = {row.get("key"): row for row in highlights.get("rows") or [] if isinstance(row, dict)}
    mapping = {
        "revenue": "revenue",
        "revenue_growth_percent": "revenue_growth",
        "ebitda": "ebitda",
        "ebitda_margin_percent": "ebitda_margin",
        "net_profit": "net_profit",
        "net_profit_growth_percent": "net_profit_growth",
        "net_profit_margin_percent": "net_profit_margin",
        "roe_percent": "roe",
        "eps": "eps",
        "bvps": "bvps",
        "der": "der",
    }
    metric_details: dict[str, list[dict[str, Any]]] = {}
    metrics: dict[str, list[float | None]] = {}
    missing_fields: list[str] = []
    for output_key, row_key in mapping.items():
        values = rows.get(row_key, {}).get("values", {})
        cells = []
        for period in periods:
            cell = values.get(period.get("key")) if isinstance(values, dict) else None
            if not isinstance(cell, dict):
                cell = {"value": None, "display": "N/A", "status": "unavailable"}
            cell = {
                **cell,
                "formula": cell.get("formula") or "Reported financial statement value",
            }
            cells.append(cell)
            if cell.get("status") == "unavailable":
                missing_fields.append(f"{period.get('key')} {output_key}")
        metric_details[output_key] = cells
        metrics[output_key] = [cell.get("value") for cell in cells]

    quality = dict(highlights.get("data_quality") or {})
    quality.update(
        {
            "missing_fields": missing_fields,
            "fallback_used": list(quality.get("fallback_used") or []),
            "warnings": list(quality.get("warnings") or []),
        }
    )
    return {
        "currency": highlights.get("currency"),
        "scale": highlights.get("scale"),
        "scale_label": highlights.get("scale_label"),
        "unit_note": highlights.get("unit_note"),
        "periods": periods,
        "metrics": metrics,
        "metric_details": metric_details,
        "summary": {
            "growth_trend": _trend(metrics["revenue_growth_percent"]),
            "margin_trend": _trend(metrics["net_profit_margin_percent"]),
            "profitability_trend": _trend(metrics["roe_percent"]),
            "leverage_trend": _trend(metrics["der"], lower_is_better=True),
        },
        "data_quality": quality,
    }
