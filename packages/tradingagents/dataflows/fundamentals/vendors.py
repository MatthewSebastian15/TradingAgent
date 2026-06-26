"""Vendor-specific normalizers: yfinance and Finnhub financials → FinancialRow.

Extracted from normalizers.py. Imports core unit/period/field helpers from
`normalizers` (one direction); that module lazily re-exports the two public
`normalize_*_financials` entry points for backward compatibility.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .financial_rows import (
    FINANCIAL_ROW_FIELDS,
    FinancialRow,
    build_period_label,
)
from .financial_rows import (
    normalize_currency as normalize_row_currency,
)
from .financial_rows import (
    normalize_unit as normalize_row_unit,
)
from .normalizers import (
    _FINANCIAL_ROW_FIELD_ALIASES,
    _FINNHUB_FIELD_ALIASES,
    _canonical_field,
    _load_mapping,
    _number_like,
    build_normalized_period_rows,
    unwrap_normalized_value,
)


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _market_for_financial_row(symbol: str | None, info: dict[str, Any] | None = None) -> str:
    value = str(symbol or "").upper()
    quote_type = str((info or {}).get("quoteType") or (info or {}).get("quote_type") or "").upper()
    if value.endswith(".JK"):
        return "IDX"
    if value.endswith("-USD") or value.endswith("-USDT") or "CRYPTO" in quote_type:
        return "CRYPTO"
    if "ETF" in quote_type:
        return "ETF"
    if "FUND" in quote_type:
        return "FUND"
    if "." in value:
        return "GLOBAL"
    return "US"


def _financial_row_source_confidence(source: str, warnings: list[str] | None = None) -> str:
    if warnings:
        return "medium"
    if source == "yfinance":
        return "high"
    if source == "finnhub":
        return "medium"
    return "medium"


def _financial_row_value(row: dict[str, Any], field: str) -> float | None:
    candidates = [field]
    candidates.extend(
        alias for alias, target in _FINANCIAL_ROW_FIELD_ALIASES.items() if target == field
    )
    for candidate in candidates:
        value = unwrap_normalized_value(row.get(candidate))
        if value is not None:
            return value
    return None


def _has_financial_row_values(row: FinancialRow) -> bool:
    return any(getattr(row, field) is not None for field in FINANCIAL_ROW_FIELDS)


def _financial_row_from_normalized_dict(
    row: dict[str, Any],
    *,
    symbol: str,
    source: str,
    market: str,
    fallback: bool = False,
    fallback_source: str | None = None,
    default_currency: str | None = None,
    default_unit: str | None = None,
) -> FinancialRow:
    period = row.get("period") if isinstance(row.get("period"), dict) else {}
    currency = normalize_row_currency(
        row.get("currency") or period.get("currency") or default_currency,
        market,
    )
    unit = normalize_row_unit(row.get("unit") or period.get("unit") or default_unit)
    as_of_date = period.get("as_of_date") or period.get("period_end") or row.get("as_of_date")
    warnings = list(row.get("warnings") or [])
    field_values = {field: _financial_row_value(row, field) for field in FINANCIAL_ROW_FIELDS}
    financial_row = FinancialRow(
        symbol=str(symbol or row.get("symbol") or "").upper(),
        period=str(
            period.get("period_label")
            or row.get("period_label")
            or build_period_label(as_of_date, "annual")
        ),
        period_type=str(period.get("period_type") or row.get("period_type") or "annual"),
        currency=currency,
        unit=unit,
        source=source,
        source_confidence=_financial_row_source_confidence(source, warnings),
        fallback=fallback,
        fallback_source=fallback_source,
        as_of_date=as_of_date,
        retrieved_at=_utc_iso(),
        warnings=warnings,
        **field_values,
    )
    if not _has_financial_row_values(financial_row):
        financial_row.warnings.append("No usable financial statement fields were normalized.")
    return financial_row


def _info_value(info: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in info and info.get(key) not in (None, "", "N/A"):
            return info.get(key)
    return None


def _row_from_yfinance_info(
    info: dict[str, Any], *, symbol: str, market: str, currency: str
) -> FinancialRow | None:
    if not isinstance(info, dict) or not info:
        return None
    values = {
        "revenue": _number_like(_info_value(info, "totalRevenue")),
        "gross_profit": _number_like(_info_value(info, "grossProfits")),
        "ebitda": _number_like(_info_value(info, "ebitda")),
        "net_profit": _number_like(_info_value(info, "netIncomeToCommon")),
        "eps": _number_like(_info_value(info, "trailingEps", "forwardEps")),
        "total_debt": _number_like(_info_value(info, "totalDebt")),
        "cash_and_equivalents": _number_like(_info_value(info, "totalCash")),
        "free_cash_flow": _number_like(_info_value(info, "freeCashflow")),
        "shares_outstanding": _number_like(_info_value(info, "sharesOutstanding")),
    }
    row = FinancialRow(
        symbol=symbol,
        period=build_period_label(
            str(info.get("mostRecentQuarter") or info.get("lastFiscalYearEnd") or ""), "annual"
        ),
        period_type="annual",
        currency=normalize_row_currency(currency, market),
        unit="raw",
        source="yfinance",
        source_confidence="medium",
        as_of_date=str(info.get("mostRecentQuarter") or info.get("lastFiscalYearEnd") or "")
        or None,
        retrieved_at=_utc_iso(),
        **values,
    )
    return row if _has_financial_row_values(row) else None


def normalize_yfinance_financials(
    financials: dict,
    balance_sheet: dict,
    cashflow: dict,
    info: dict | None = None,
) -> list[FinancialRow]:
    """Map yfinance financial data into FinancialRow list."""
    info = info if isinstance(info, dict) else {}
    symbol = str(info.get("symbol") or info.get("ticker") or "").upper()
    market = _market_for_financial_row(symbol, info)
    currency = normalize_row_currency(info.get("financialCurrency") or info.get("currency"), market)
    rows = build_normalized_period_rows(
        income_statement=financials,
        balance_sheet=balance_sheet,
        cashflow=cashflow,
        default_unit="raw",
        default_currency=currency,
    )
    normalized = [
        _financial_row_from_normalized_dict(
            row,
            symbol=symbol,
            source="yfinance",
            market=market,
            default_currency=currency,
            default_unit="raw",
        )
        for row in rows
    ]
    shares_outstanding = _number_like(
        _info_value(info, "sharesOutstanding", "impliedSharesOutstanding")
    )
    for row in normalized:
        if not row.shares_outstanding and shares_outstanding is not None:
            row.shares_outstanding = shares_outstanding
    if not normalized:
        info_row = _row_from_yfinance_info(info, symbol=symbol, market=market, currency=currency)
        if info_row is not None:
            normalized.append(info_row)
    return normalized


def _flatten_finnhub_values(value: Any, output: dict[str, Any]) -> None:
    if isinstance(value, dict):
        concept = (
            value.get("concept") or value.get("label") or value.get("name") or value.get("field")
        )
        if concept and any(key in value for key in ("value", "amount", "v")):
            output[str(concept)] = value.get("value", value.get("amount", value.get("v")))
            return
        for key, item in value.items():
            if key in {"report", "bs", "ic", "cf"} or isinstance(item, (dict, list)):
                _flatten_finnhub_values(item, output)
            else:
                output[str(key)] = item
        return
    if isinstance(value, list):
        for item in value:
            _flatten_finnhub_values(item, output)


def _finnhub_period_type(report: dict[str, Any], default_type: str) -> str:
    text = " ".join(
        str(report.get(key) or "") for key in ("freq", "period", "fp", "form", "quarter")
    ).upper()
    if "Q" in text or report.get("quarter") not in (None, ""):
        return "quarterly"
    if "FY" in text or report.get("year") not in (None, ""):
        return "annual"
    return default_type


def _finnhub_field_name(raw_key: str) -> str | None:
    canonical = _canonical_field(raw_key)
    if canonical.startswith("us_gaap_"):
        canonical = canonical.removeprefix("us_gaap_")
    compact = canonical.replace("_", "")
    return (
        _FINANCIAL_ROW_FIELD_ALIASES.get(canonical)
        or _FINNHUB_FIELD_ALIASES.get(canonical)
        or _FINNHUB_FIELD_ALIASES.get(compact)
    )


def _finnhub_reports(payload: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("reports", "data", "financials"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return [payload] if payload else []


def normalize_finnhub_financials(
    reported: dict,
    profile: dict | None = None,
) -> list[FinancialRow]:
    """Map Finnhub financial data into FinancialRow list."""
    payload = _load_mapping(reported) if isinstance(reported, str) else reported
    if not isinstance(payload, dict):
        return []
    profile = profile if isinstance(profile, dict) else {}
    company = profile.get("company") if isinstance(profile.get("company"), dict) else profile
    symbol = str(
        payload.get("symbol") or company.get("ticker") or company.get("symbol") or ""
    ).upper()
    market = _market_for_financial_row(symbol, company)
    currency = normalize_row_currency(
        payload.get("currency") or company.get("currency") or company.get("currency_symbol"),
        market,
    )
    rows: list[FinancialRow] = []
    for report in _finnhub_reports(payload):
        flat: dict[str, Any] = {}
        _flatten_finnhub_values(report, flat)
        period_type = _finnhub_period_type(report, str(payload.get("freq") or "annual"))
        end_date = (
            report.get("endDate")
            or report.get("end_date")
            or report.get("period")
            or report.get("fiscalDateEnding")
            or report.get("year")
        )
        values = {field: None for field in FINANCIAL_ROW_FIELDS}
        for raw_key, raw_value in flat.items():
            field = _finnhub_field_name(raw_key)
            if field in values:
                values[field] = _number_like(raw_value)
        if values.get("shares_outstanding") is None:
            values["shares_outstanding"] = _number_like(
                company.get("shareOutstanding") or company.get("shares_outstanding")
            )
        row = FinancialRow(
            symbol=symbol,
            period=build_period_label(str(end_date or ""), period_type),
            period_type=period_type,
            currency=currency,
            unit="raw",
            source="finnhub",
            source_confidence="medium",
            fallback=True,
            fallback_source="finnhub",
            as_of_date=str(end_date) if end_date else None,
            retrieved_at=_utc_iso(),
            **values,
        )
        if _has_financial_row_values(row):
            rows.append(row)
    return rows
