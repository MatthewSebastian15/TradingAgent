from __future__ import annotations

from typing import Any

from tradingagents.utils.normalization import number as _number



def _latest_metric(result: dict[str, Any], key: str) -> float | None:
    trends = result.get("financial_trends") if isinstance(result.get("financial_trends"), dict) else {}
    metrics = trends.get("metrics") if isinstance(trends.get("metrics"), dict) else {}
    values = metrics.get(key)
    if not isinstance(values, list):
        return None
    for value in reversed(values):
        number = _number(value)
        if number is not None:
            return number
    return None


def _status_from_data(value: Any, *, invalid_when: bool, watch_when: bool = False) -> str:
    if value is None:
        return "unknown"
    if invalid_when:
        return "invalidated"
    if watch_when:
        return "watch"
    return "valid"


def build_thesis_monitor(result: dict[str, Any], data_quality_score: int | None = None) -> dict[str, Any]:
    current_price = _number(result.get("current_price") or result.get("last_close_price"))
    stop_loss = _number(result.get("stop_loss"))
    revenue_growth = _latest_metric(result, "revenue_growth_percent")
    margin = _latest_metric(result, "net_profit_margin_percent")
    der = _number((result.get("balance_sheet_risk") or {}).get("der"))
    cfo_to_net_income = _number((result.get("quality_of_earnings") or {}).get("cfo_to_net_income"))
    bull_value = _number((result.get("fair_value_range") or {}).get("bull"))
    negative_catalysts = (result.get("catalyst_tracker") or {}).get("negative_catalysts")
    negative_count = len(negative_catalysts) if isinstance(negative_catalysts, list) else 0

    checklist = [
        {
            "category": "Financial",
            "condition": "Revenue growth turns negative",
            "status": _status_from_data(
                revenue_growth,
                invalid_when=revenue_growth is not None and revenue_growth < 0,
                watch_when=revenue_growth is not None and revenue_growth < 5,
            ),
            "reason": "Latest revenue growth is unavailable."
            if revenue_growth is None
            else f"Latest revenue growth is {round(revenue_growth, 2)}%.",
        },
        {
            "category": "Margin",
            "condition": "Net profit margin declines below threshold",
            "status": _status_from_data(
                margin,
                invalid_when=margin is not None and margin < 0,
                watch_when=margin is not None and margin < 10,
            ),
            "reason": "Latest margin is unavailable."
            if margin is None
            else f"Latest net profit margin is {round(margin, 2)}%.",
        },
        {
            "category": "Balance Sheet",
            "condition": "DER rises above threshold",
            "status": _status_from_data(
                der,
                invalid_when=der is not None and der > 2,
                watch_when=der is not None and der > 1,
            ),
            "reason": "DER is unavailable." if der is None else f"Latest DER is {round(der, 2)}x.",
        },
        {
            "category": "Cashflow",
            "condition": "Operating cash flow remains below net income",
            "status": _status_from_data(
                cfo_to_net_income,
                invalid_when=cfo_to_net_income is not None and cfo_to_net_income < 0.7,
                watch_when=cfo_to_net_income is not None and cfo_to_net_income < 1,
            ),
            "reason": "CFO / Net Income is unavailable."
            if cfo_to_net_income is None
            else f"CFO / Net Income is {round(cfo_to_net_income, 2)}x.",
        },
        {
            "category": "Price",
            "condition": "Price breaks stop loss",
            "status": _status_from_data(
                current_price if stop_loss is not None else None,
                invalid_when=current_price is not None and stop_loss is not None and current_price <= stop_loss,
            ),
            "reason": "Current price or stop loss is unavailable."
            if current_price is None or stop_loss is None
            else "Current price remains above stop loss.",
        },
        {
            "category": "Valuation",
            "condition": "Stock trades above bull fair value without earnings upgrade",
            "status": _status_from_data(
                current_price if bull_value is not None else None,
                invalid_when=current_price is not None and bull_value is not None and current_price > bull_value,
                watch_when=current_price is not None and bull_value is not None and current_price > bull_value * 0.95,
            ),
            "reason": "Current price or bull fair value is unavailable."
            if current_price is None or bull_value is None
            else "Current price is checked against bull fair value.",
        },
        {
            "category": "News",
            "condition": "Major negative catalyst appears",
            "status": "watch" if negative_count else "valid",
            "reason": f"{negative_count} negative catalyst item(s) detected.",
        },
        {
            "category": "Data",
            "condition": "Important fields missing or vendor confidence low",
            "status": "unknown"
            if data_quality_score is None
            else "invalidated"
            if data_quality_score < 40
            else "watch"
            if data_quality_score < 60
            else "valid",
            "reason": "Data quality score is unavailable."
            if data_quality_score is None
            else f"Data quality score is {data_quality_score}.",
        },
    ]
    statuses = [item["status"] for item in checklist]
    if "invalidated" in statuses:
        overall = "invalidated"
    elif "watch" in statuses:
        overall = "valid_with_watch_items"
    elif all(status == "unknown" for status in statuses):
        overall = "unknown"
    else:
        overall = "valid"
    return {"checklist": checklist, "overall_thesis_status": overall}
