from __future__ import annotations

from typing import Any

from tradingagents.financial_highlights.calculator import (
    calculate_payout_ratio,
    safe_divide,
    safe_percent,
)

from .common import data_quality, metric, metric_values


def build_dividend_quality(
    snapshot: dict[str, Any], quality_of_earnings: dict[str, Any]
) -> dict[str, Any]:
    currency = snapshot["currency"]
    dividend_per_share = snapshot.get("dividend_per_share")
    dividend_paid = snapshot.get("dividend_paid")
    eps = snapshot.get("eps")
    free_cash_flow = quality_of_earnings.get("free_cash_flow")
    payout_ratio = calculate_payout_ratio(dividend_per_share, eps)
    fallbacks = []
    if payout_ratio is None and dividend_paid is not None:
        payout_ratio = safe_percent(dividend_paid, snapshot.get("net_profit"))
        fallbacks.append(
            "Payout ratio uses dividend paid / net income because per-share dividend is unavailable"
        )
    details = {
        "dividend_yield_percent": metric(
            safe_percent(dividend_per_share, snapshot.get("current_price")),
            currency=currency,
            format_type="percent",
            formula="Dividend per Share / Current Price * 100",
        ),
        "payout_ratio_percent": metric(
            payout_ratio,
            currency=currency,
            format_type="percent",
            formula="Dividend per Share / EPS * 100; fallback to Dividend Paid / Net Income * 100",
        ),
        "fcf_coverage": metric(
            safe_divide(free_cash_flow, dividend_paid),
            currency=currency,
            format_type="ratio",
            formula="Free Cash Flow / Dividend Paid",
        ),
    }
    values = metric_values(details)
    if dividend_per_share == 0 or dividend_paid == 0:
        sustainability = "not_dividend_focused"
    elif values["payout_ratio_percent"] is None:
        sustainability = "N/A"
    elif values["payout_ratio_percent"] < 60 and free_cash_flow is not None and free_cash_flow > 0:
        sustainability = "sustainable"
    elif values["payout_ratio_percent"] <= 90:
        sustainability = "watch"
    else:
        sustainability = "risky"
    return {
        **values,
        "metric_details": details,
        "sustainability": sustainability,
        "notes": ["Dividend quality uses reported dividend data when available."],
        "data_quality": data_quality(details, fallback_used=fallbacks),
    }
