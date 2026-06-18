"""Dividend and payout status helpers."""

from __future__ import annotations

from typing import Any

from tradingagents.utils.normalization import number as _number

DIVIDEND_STATUSES = {
    "available",
    "partial",
    "no_dividend_history",
    "not_applicable_negative_earnings",
    "source_unavailable",
    "period_mismatch",
}



def _cash_dividend_amount(row: dict[str, Any]) -> float | None:
    for key in ("amount", "cash_amount", "dividend", "dividend_per_share", "cash_dividend"):
        amount = _number(row.get(key))
        if amount is not None and amount != 0:
            return amount
    return None


def _event_total(row: dict[str, Any]) -> float | None:
    for key in ("total", "total_amount", "dividend_total", "cash_total", "value"):
        total = _number(row.get(key))
        if total is not None and total != 0:
            return abs(total)
    return None


def _base_payload(ticker: str, source: str, status: str, reason: str | None, warnings: list[str] | None = None) -> dict[str, Any]:
    return {
        "ticker": ticker,
        "dividend_status": status,
        "status": status,
        "latest_dividend_per_share": None,
        "dividend_yield": None,
        "dividend_yield_percent": None,
        "payout_ratio": None,
        "payout_ratio_percent": None,
        "fcf_coverage": None,
        "source": source,
        "reason": reason,
        "warnings": warnings or [],
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
    rows = [row for row in (dividends or []) if isinstance(row, dict)]
    if dividends is None:
        return _base_payload(
            ticker,
            source,
            "source_unavailable",
            "Dividend source did not return usable data for the selected period",
        )

    cash_dividends = []
    for row in rows:
        amount = _cash_dividend_amount(row)
        if amount is not None:
            enriched = dict(row)
            enriched["_cash_amount"] = amount
            cash_dividends.append(enriched)

    if not cash_dividends:
        return _base_payload(
            ticker,
            source,
            "no_dividend_history",
            "No cash dividend found for selected period",
        )

    latest = sorted(cash_dividends, key=lambda row: str(row.get("ex_date") or row.get("date") or row.get("payment_date") or ""))[-1]
    amount = _number(latest.get("_cash_amount")) or 0.0
    price = _number(latest_price)
    profit = _number(net_profit)
    fcf = _number(free_cash_flow)
    dividend_total = _event_total(latest) or amount

    warnings: list[str] = []
    dividend_yield = (amount / price * 100) if price and price > 0 else None
    if dividend_yield is None:
        warnings.append("latest price unavailable; dividend yield cannot be calculated")

    payout_ratio = None
    status = "available"
    reason = None
    if profit is not None and profit < 0:
        status = "not_applicable_negative_earnings"
        reason = "Payout ratio is not meaningful when earnings are negative."
    elif profit is not None and profit > 0 and dividend_total:
        payout_ratio = dividend_total / profit * 100
    else:
        status = "partial"
        warnings.append("net profit unavailable; payout ratio cannot be calculated")

    fcf_coverage = None
    if fcf is not None and dividend_total:
        fcf_coverage = fcf / dividend_total
    else:
        if status == "available":
            status = "partial"
        warnings.append("free cash flow unavailable; FCF coverage cannot be calculated")

    return {
        "ticker": ticker,
        "dividend_status": status,
        "status": status,
        "latest_dividend_per_share": amount,
        "dividend_yield": dividend_yield,
        "dividend_yield_percent": dividend_yield,
        "payout_ratio": payout_ratio,
        "payout_ratio_percent": payout_ratio,
        "fcf_coverage": fcf_coverage,
        "source": source,
        "reason": reason,
        "warnings": list(dict.fromkeys(warnings)),
    }
