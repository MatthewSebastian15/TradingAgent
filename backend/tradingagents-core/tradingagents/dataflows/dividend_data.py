"""Dividend and payout status helpers."""

from __future__ import annotations

from typing import Any

DIVIDEND_STATUSES = {
    "available",
    "no_dividend_history",
    "not_applicable_negative_earnings",
    "source_unavailable",
    "period_mismatch",
}


def build_dividend_status(
    *,
    ticker: str,
    dividends: list[dict[str, Any]] | None = None,
    latest_price: float | None = None,
    net_profit: float | None = None,
    free_cash_flow: float | None = None,
    source: str = "idx_corporate_action",
) -> dict[str, Any]:
    rows = dividends or []
    cash_dividends = [row for row in rows if (row.get("amount") or row.get("cash_amount")) not in (None, "", 0)]
    if not cash_dividends:
        return {
            "ticker": ticker,
            "dividend_status": "no_dividend_history",
            "latest_dividend_per_share": None,
            "dividend_yield": None,
            "payout_ratio": None,
            "fcf_coverage": None,
            "source": source,
            "reason": "No cash dividend found for selected period",
        }
    latest = sorted(cash_dividends, key=lambda row: str(row.get("ex_date") or row.get("date") or ""))[-1]
    amount = float(latest.get("amount") or latest.get("cash_amount") or 0)
    dividend_yield = (amount / latest_price * 100) if latest_price else None
    if net_profit is not None and net_profit <= 0:
        payout_ratio = None
        status = "not_applicable_negative_earnings"
        reason = "Payout ratio is not meaningful when earnings are negative."
    else:
        payout_ratio = (amount / net_profit * 100) if net_profit else None
        status = "available"
        reason = None
    return {
        "ticker": ticker,
        "dividend_status": status,
        "latest_dividend_per_share": amount,
        "dividend_yield": dividend_yield,
        "payout_ratio": payout_ratio,
        "fcf_coverage": (free_cash_flow / amount) if free_cash_flow and amount else None,
        "source": source,
        "reason": reason,
    }
