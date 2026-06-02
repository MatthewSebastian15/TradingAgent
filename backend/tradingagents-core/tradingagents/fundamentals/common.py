from __future__ import annotations

from dataclasses import asdict
from typing import Any

from tradingagents.financial_highlights.calculator import safe_divide
from tradingagents.financial_highlights.formatter import (
    convert_amount,
    currency_metadata,
    format_currency_scaled,
    format_number,
    format_percent,
    format_ratio,
)
from tradingagents.financial_highlights.models import FinancialPeriod

POLICY_MULTIPLES = {
    "P/BV": {"bear": 1.0, "base": 1.5, "bull": 2.0},
    "EV/EBITDA": {"bear": 6.0, "base": 8.0, "bull": 10.0},
    "P/E": {"bear": 10.0, "base": 15.0, "bull": 20.0},
    "P/S": {"bear": 1.0, "base": 2.0, "bull": 3.0},
}

FINANCIAL_SECTOR_KEYWORDS = ("bank", "financial", "insurance", "asset management", "capital markets")


def is_financial_sector(snapshot: dict[str, Any]) -> bool:
    sector_text = " ".join(str(snapshot.get(key) or "") for key in ("sector", "industry")).lower()
    return any(keyword in sector_text for keyword in FINANCIAL_SECTOR_KEYWORDS)


def _record_value(record: dict[str, Any] | None) -> float | None:
    value = record.get("value") if isinstance(record, dict) else None
    return float(value) if isinstance(value, (int, float)) else None


def latest_record(
    normalized: dict[str, Any],
    periods: list[FinancialPeriod],
    field: str,
) -> tuple[dict[str, Any] | None, str | None]:
    normalized_periods = normalized.get("periods", {})
    for period in reversed(periods):
        record = normalized_periods.get(period.key, {}).get(field)
        if isinstance(record, dict) and _record_value(record) is not None:
            return record, period.key
    return None, None


def build_snapshot(
    *,
    normalized: dict[str, Any],
    periods: list[FinancialPeriod],
    company_profile: dict[str, Any] | None,
    current_price: float | None,
) -> dict[str, Any]:
    profile = company_profile or {}
    fields = (
        "revenue",
        "ebitda",
        "net_profit",
        "total_equity",
        "total_debt",
        "cash",
        "current_liabilities",
        "total_liabilities",
        "total_assets",
        "operating_income",
        "operating_cash_flow",
        "capex",
        "dividend_paid",
        "shares_outstanding",
        "eps",
        "dividend_per_share",
    )
    snapshot: dict[str, Any] = {
        "currency": str(normalized.get("currency") or profile.get("currency") or "USD").upper(),
        "sector": profile.get("sector"),
        "industry": profile.get("industry"),
        "periods": [asdict(period) for period in periods],
        "records": {},
        "period_keys": {},
        "current_price": current_price,
    }
    for field in fields:
        record, period_key = latest_record(normalized, periods, field)
        snapshot["records"][field] = record
        snapshot["period_keys"][field] = period_key
        snapshot[field] = _record_value(record)

    if snapshot["shares_outstanding"] is None and isinstance(profile.get("shares_outstanding"), (int, float)):
        snapshot["shares_outstanding"] = float(profile["shares_outstanding"])
        snapshot["records"]["shares_outstanding"] = {
            "value": snapshot["shares_outstanding"],
            "source_vendor": "company_profile",
            "source_field": "shares_outstanding",
        }

    market_cap = None
    market_cap_status = "unavailable"
    market_cap_formula = "Current Price * Shares Outstanding"
    if current_price is not None and snapshot["shares_outstanding"] is not None:
        market_cap = current_price * snapshot["shares_outstanding"]
        market_cap_status = "calculated"
    elif isinstance(profile.get("market_cap"), (int, float)):
        market_cap = float(profile["market_cap"])
        market_cap_status = "estimated"
        market_cap_formula = "Company profile market cap fallback"

    snapshot["market_cap"] = market_cap
    snapshot["market_cap_status"] = market_cap_status
    snapshot["market_cap_formula"] = market_cap_formula
    snapshot["eps"] = snapshot["eps"] if snapshot["eps"] is not None else safe_divide(
        snapshot["net_profit"], snapshot["shares_outstanding"]
    )
    snapshot["bvps"] = safe_divide(snapshot["total_equity"], snapshot["shares_outstanding"])
    return snapshot


def effective_ebitda(snapshot: dict[str, Any]) -> tuple[float | None, str, str]:
    if snapshot.get("ebitda") is not None:
        return float(snapshot["ebitda"]), "reported", "EBITDA"
    if snapshot.get("operating_income") is not None:
        return float(snapshot["operating_income"]), "estimated", "Operating Income proxy for EBITDA"
    return None, "unavailable", "EBITDA"


def select_primary_method(snapshot: dict[str, Any]) -> str | None:
    if is_financial_sector(snapshot) and snapshot.get("bvps") is not None:
        return "P/BV"
    ebitda, _status, _source = effective_ebitda(snapshot)
    if (
        ebitda is not None
        and snapshot.get("total_debt") is not None
        and snapshot.get("cash") is not None
        and snapshot.get("shares_outstanding") is not None
    ):
        return "EV/EBITDA"
    if snapshot.get("eps") is not None:
        return "P/E"
    if snapshot.get("revenue") is not None and snapshot.get("shares_outstanding") is not None:
        return "P/S"
    return None


def _display(value: float | None, format_type: str, currency: str) -> str:
    if value is None:
        return "N/A"
    if format_type == "percent":
        return format_percent(value)
    if format_type == "ratio":
        return format_ratio(value)
    if format_type == "currency":
        metadata = currency_metadata(currency)
        scaled = convert_amount(value, source_unit="raw", scale_divisor=float(metadata["scale_divisor"]))
        return f"{format_currency_scaled(scaled)} {metadata['scale_label']}"
    if format_type == "price":
        return f"{currency} {format_number(value)}"
    return format_number(value)


def metric(
    value: float | None,
    *,
    currency: str,
    format_type: str,
    formula: str,
    status: str = "calculated",
) -> dict[str, Any]:
    normalized_status = status if value is not None else "unavailable"
    return {
        "value": value,
        "display": _display(value, format_type, currency),
        "status": normalized_status,
        "formula": formula,
    }


def data_quality(
    metric_details: dict[str, dict[str, Any]],
    *,
    fallback_used: list[str] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    fallbacks = list(dict.fromkeys(fallback_used or []))
    notes = list(dict.fromkeys(warnings or []))
    missing = [key for key, item in metric_details.items() if item.get("status") == "unavailable"]
    available_count = len(metric_details) - len(missing)
    status = "unavailable" if available_count == 0 else "complete"
    if missing or fallbacks or notes:
        status = "partial" if available_count else "unavailable"
    return {
        "status": status,
        "missing_fields": missing,
        "fallback_used": fallbacks,
        "warnings": notes,
    }


def metric_values(metric_details: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {key: item.get("value") for key, item in metric_details.items()}
