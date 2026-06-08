"""Unit, currency, and period normalization for financial statement values."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, is_dataclass
from typing import Any

from .period_metadata import attach_period_metadata_to_rows, merge_period_metadata

UNIT_MULTIPLIER = {
    "raw": 1,
    "unit": 1,
    "full": 1,
    "rupiah": 1,
    "idr": 1,
    "thousand": 1_000,
    "thousands": 1_000,
    "ribu": 1_000,
    "k": 1_000,
    "million": 1_000_000,
    "millions": 1_000_000,
    "juta": 1_000_000,
    "m": 1_000_000,
    "billion": 1_000_000_000,
    "billions": 1_000_000_000,
    "miliar": 1_000_000_000,
    "bn": 1_000_000_000,
    "b": 1_000_000_000,
    "trillion": 1_000_000_000_000,
    "trillions": 1_000_000_000_000,
    "triliun": 1_000_000_000_000,
    "tn": 1_000_000_000_000,
    "t": 1_000_000_000_000,
}

_UNIT_ALIASES = {
    "rp": "raw",
    "idr": "raw",
    "k": "thousand",
    "ribu": "thousand",
    "m": "million",
    "mn": "million",
    "juta": "million",
    "b": "billion",
    "bn": "billion",
    "miliar": "billion",
    "t": "trillion",
    "tn": "trillion",
    "triliun": "trillion",
}

_SUFFIX_PATTERN = re.compile(
    r"^\s*(?P<prefix>rp|idr|usd)?\s*(?P<number>[-+]?\d+(?:[.,]\d+)?)\s*"
    r"(?P<suffix>k|m|mn|b|bn|t|tn|ribu|juta|miliar|triliun|thousand|million|billion|trillion|thousands|millions|billions|trillions)?\s*$",
    re.IGNORECASE,
)

FINANCIAL_FIELDS = {
    "revenue",
    "gross_profit",
    "ebitda",
    "operating_income",
    "net_profit",
    "operating_cash_flow",
    "cash_from_operations",
    "capex",
    "capital_expenditure",
    "free_cash_flow",
    "cash",
    "cash_and_equivalents",
    "debt",
    "total_debt",
    "equity",
    "total_equity",
    "assets",
    "total_assets",
    "total_liabilities",
    "current_liabilities",
    "shares_outstanding",
    "eps",
    "dividend_per_share",
    "dividend_paid",
    "reference_price",
    "dividend_yield",
    "market_cap",
    "enterprise_value",
    "pe",
    "pbv",
    "ps",
    "ev_ebitda",
}

_FIELD_ALIASES = {
    "total_assets": "assets",
    "total_equity": "equity",
    "stockholders_equity": "equity",
    "shareholders_equity": "equity",
    "total_debt": "debt",
    "cash_from_operations": "operating_cash_flow",
    "capital_expenditure": "capex",
    "capital_expenditures": "capex",
    "net_income": "net_profit",
    "net_income_common_stockholders": "net_profit",
    "total_revenue": "revenue",
    "cash_dividends_paid": "dividend_paid",
    "dividends_paid": "dividend_paid",
    "dividend_payout": "dividend_paid",
    "market_capitalization": "market_cap",
    "market_cap": "market_cap",
    "enterprise_value": "enterprise_value",
    "p_e": "pe",
    "pe_ratio": "pe",
    "p_bv": "pbv",
    "p_b": "pbv",
    "pb_ratio": "pbv",
    "price_to_book": "pbv",
    "p_s": "ps",
    "ps_ratio": "ps",
    "price_to_sales": "ps",
    "ev_ebitda": "ev_ebitda",
    "enterprise_value_to_ebitda": "ev_ebitda",
}


def _normalize_unit(unit: str | None) -> str:
    raw = str(unit or "raw").strip().lower()
    return _UNIT_ALIASES.get(raw, raw or "raw")


def _normalize_currency(currency: str | None) -> str:
    return str(currency or "IDR").strip().upper()


def _canonical_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def _canonical_field(value: Any) -> str:
    key = _canonical_key(value)
    return _FIELD_ALIASES.get(key, key)


def _parse_numeric_and_unit(value: Any, unit: str) -> tuple[float | None, str, str | None]:
    if value in (None, "", "N/A", "n/a", "NA", "-"):
        return None, unit, None
    if isinstance(value, bool):
        return None, unit, "value could not be parsed as a number"
    if isinstance(value, (int, float)):
        number = float(value)
        return (number if number == number else None), unit, None

    text = str(value).strip()
    if not text or text.lower() in {"n/a", "na", "none", "null", "-"}:
        return None, unit, None

    cleaned = text.replace("Rp", "Rp ").replace("IDR", "IDR ").replace("USD", "USD ")
    match = _SUFFIX_PATTERN.match(cleaned.replace(" ", "")) or _SUFFIX_PATTERN.match(cleaned)
    if match:
        suffix = match.group("suffix")
        detected_unit = _normalize_unit(suffix) if suffix else unit
        raw_number = match.group("number")
        if "," in raw_number and "." not in raw_number:
            whole, fraction = raw_number.split(",", 1)
            if suffix and len(fraction) != 3:
                raw_number = f"{whole}.{fraction}"
            elif len(fraction) == 3:
                raw_number = whole + fraction
            else:
                raw_number = f"{whole}.{fraction}"
        else:
            raw_number = raw_number.replace(",", "")
        try:
            return float(raw_number), detected_unit, None
        except ValueError:
            return None, detected_unit, "value could not be parsed as a number"

    sanitized = re.sub(r"(?i)\b(rp|idr|usd)\b", "", text).strip()
    sanitized = sanitized.replace(",", "")
    try:
        return float(sanitized), unit, None
    except (TypeError, ValueError):
        return None, unit, "value could not be parsed as a number"


def parse_numeric_value(value: object) -> float | None:
    numeric, detected_unit, _warning = _parse_numeric_and_unit(value, "raw")
    if numeric is None:
        return None
    return numeric * UNIT_MULTIPLIER.get(detected_unit, 1)


def normalize_financial_value(
    value: float | int | str | None, unit: str = "raw", currency: str = "IDR"
) -> dict[str, Any]:
    raw_unit = _normalize_unit(unit)
    normalized_currency = _normalize_currency(currency)
    numeric, detected_unit, warning = _parse_numeric_and_unit(value, raw_unit)
    warnings = [warning] if warning else []
    if numeric is None:
        warnings.append("Value cannot be normalized")
    normalized_value = None if numeric is None else numeric * UNIT_MULTIPLIER.get(detected_unit, 1)
    payload = {
        "raw_value": numeric
        if numeric is not None
        else value
        if value not in (None, "", "N/A", "n/a", "NA", "-")
        else None,
        "raw_unit": detected_unit,
        "raw_currency": normalized_currency,
        "normalized_value": normalized_value,
        "normalized_unit": "raw",
        "normalized_currency": normalized_currency,
        "status": "available" if normalized_value is not None else "source_unavailable",
        "warnings": list(dict.fromkeys(warnings)),
    }
    if warning:
        payload["warning"] = warning
    return payload


def normalize_financial_field(value: Any, unit: str = "raw", currency: str = "IDR") -> dict[str, Any]:
    return normalize_financial_value(value, unit=unit, currency=currency)


def normalize_financial_rows(
    rows: list[dict[str, Any]] | None,
    default_unit: str = "raw",
    default_currency: str = "IDR",
    default_period_type: str = "annual",
) -> list[dict[str, Any]]:
    rows_with_period = attach_period_metadata_to_rows(
        rows,
        default_period_type=default_period_type,
        default_currency=default_currency,
        default_unit=default_unit,
    )
    normalized_rows: list[dict[str, Any]] = []
    for row in rows_with_period:
        item = dict(row)
        period = item.get("period") if isinstance(item.get("period"), dict) else {}
        unit = item.get("unit") or period.get("unit") or default_unit
        currency = item.get("currency") or period.get("currency") or default_currency
        item["unit"] = _normalize_unit(unit)
        item["currency"] = _normalize_currency(currency)

        for key in list(item.keys()):
            canonical = _canonical_field(key)
            if canonical != key and canonical not in item:
                item[canonical] = item.pop(key)

        for field in FINANCIAL_FIELDS:
            value = item.get(field)
            if field in item and not isinstance(value, dict):
                item[field] = normalize_financial_field(value, unit=item["unit"], currency=item["currency"])
        normalized_rows.append(item)
    return normalized_rows


def normalized_number(value: Any, unit: str = "raw", currency: str = "IDR") -> float | None:
    result = normalize_financial_value(value, unit=unit, currency=currency)
    normalized = result.get("normalized_value")
    try:
        number = float(normalized)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _load_mapping(payload: Any) -> dict[str, Any] | None:
    if isinstance(payload, dict):
        return payload
    if not isinstance(payload, str):
        return None
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _looks_like_period_key(value: Any) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    return bool(
        re.search(r"^(?:FY)?\d{2,4}(?:Q[1-4])?$", text, flags=re.IGNORECASE)
        or re.search(r"^Q[1-4]\s*(?:FY)?\d{2,4}$", text, flags=re.IGNORECASE)
        or re.search(r"^\d{4}-\d{2}-\d{2}$", text)
        or text.upper().startswith("TTM")
    )


def _row_from_period_mapping(period_label: str, values: Any, period_type_hint: str) -> dict[str, Any] | None:
    if not isinstance(values, dict):
        return None
    row = {"period_label": period_label, "period_type": period_type_hint}
    for raw_key, raw_value in values.items():
        if isinstance(raw_value, dict):
            value = raw_value.get("normalized_value", raw_value.get("value", raw_value.get("raw_value")))
            row[_canonical_field(raw_key)] = value
            if raw_value.get("source_unit") or raw_value.get("unit") or raw_value.get("raw_unit"):
                row.setdefault(
                    "unit", raw_value.get("source_unit") or raw_value.get("unit") or raw_value.get("raw_unit")
                )
            if raw_value.get("currency") or raw_value.get("raw_currency") or raw_value.get("normalized_currency"):
                row.setdefault(
                    "currency",
                    raw_value.get("currency") or raw_value.get("raw_currency") or raw_value.get("normalized_currency"),
                )
        else:
            row[_canonical_field(raw_key)] = raw_value
    return row


def _extract_statement_rows(payload: Any, default_period_type: str) -> list[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [
            dict(item, period_type=item.get("period_type") or default_period_type)
            for item in payload
            if isinstance(item, dict)
        ]
    mapping = _load_mapping(payload)
    if not mapping:
        return []

    rows: list[dict[str, Any]] = []
    for key, period_type in (("annual", "annual"), ("quarterly", "quarterly")):
        if key in mapping:
            rows.extend(_extract_statement_rows(mapping[key], period_type))
    for key, period_type in (("annualReports", "annual"), ("quarterlyReports", "quarterly")):
        reports = mapping.get(key)
        if isinstance(reports, list):
            for report in reports:
                if isinstance(report, dict):
                    item = dict(report)
                    item.setdefault("period_type", period_type)
                    rows.append(item)

    periods = mapping.get("periods") if isinstance(mapping.get("periods"), dict) else None
    if periods:
        for label, values in periods.items():
            row = _row_from_period_mapping(str(label), values, default_period_type)
            if row:
                rows.append(row)

    if mapping and all(_looks_like_period_key(key) and isinstance(value, dict) for key, value in mapping.items()):
        for label, values in mapping.items():
            row = _row_from_period_mapping(str(label), values, default_period_type)
            if row:
                rows.append(row)

    if not rows and any(
        _canonical_field(key) in FINANCIAL_FIELDS or key in {"period", "period_label", "fiscalDateEnding"}
        for key in mapping
    ):
        item = dict(mapping)
        item.setdefault("period_type", default_period_type)
        rows.append(item)

    return rows


def _rows_from_vendor_parser(
    income_statement: Any | None,
    balance_sheet: Any | None,
    cashflow: Any | None,
    *,
    default_unit: str,
    default_currency: str,
) -> list[dict[str, Any]]:
    try:
        from tradingagents.financial_highlights.statement_parser import parse_vendor_financials
    except Exception:
        return []

    parsed = parse_vendor_financials(
        ticker="UNKNOWN",
        periods=[],
        income_statement=income_statement,
        balance_sheet=balance_sheet,
        cashflow=cashflow,
    )
    periods = parsed.get("periods") if isinstance(parsed, dict) else {}
    if not isinstance(periods, dict):
        return []

    rows: list[dict[str, Any]] = []
    currency = default_currency or parsed.get("currency") or "IDR"
    for period_key, values in periods.items():
        if not isinstance(values, dict):
            continue
        period_type = "quarterly" if "Q" in str(period_key).upper() else "annual"
        row: dict[str, Any] = {
            "period_label": str(period_key),
            "period_type": period_type,
            "currency": currency,
            "unit": default_unit,
        }
        for raw_field, payload in values.items():
            field = _canonical_field(raw_field)
            value = payload.get("value") if isinstance(payload, dict) else payload
            unit = payload.get("source_unit") if isinstance(payload, dict) else default_unit
            row[field] = normalize_financial_field(value, unit=unit or default_unit, currency=currency)
        rows.append(row)
    return rows


def _period_sort_key(row: dict[str, Any]) -> tuple[str, str]:
    period = row.get("period") if isinstance(row.get("period"), dict) else {}
    return (str(period.get("period_end") or ""), str(period.get("period_label") or row.get("period_label") or ""))


def build_normalized_period_rows(
    *,
    income_statement: Any | None = None,
    balance_sheet: Any | None = None,
    cashflow: Any | None = None,
    default_unit: str = "raw",
    default_currency: str = "IDR",
) -> list[dict[str, Any]]:
    statement_groups = (
        (_extract_statement_rows(income_statement, "annual"), "annual"),
        (_extract_statement_rows(balance_sheet, "annual"), "annual"),
        (_extract_statement_rows(cashflow, "annual"), "annual"),
    )
    direct_rows = [row for rows, _period_type in statement_groups for row in rows]
    if not direct_rows:
        direct_rows = _rows_from_vendor_parser(
            income_statement,
            balance_sheet,
            cashflow,
            default_unit=default_unit,
            default_currency=default_currency,
        )

    normalized_rows = normalize_financial_rows(
        direct_rows,
        default_unit=default_unit,
        default_currency=default_currency,
        default_period_type="annual",
    )
    by_period: dict[str, dict[str, Any]] = {}
    for row in normalized_rows:
        period = row.get("period") if isinstance(row.get("period"), dict) else {}
        label = period.get("period_label") or row.get("period_label")
        if not label:
            continue
        bucket = by_period.setdefault(str(label), {"period": period})
        bucket["period"] = merge_period_metadata(bucket.get("period"), period)
        bucket["currency"] = row.get("currency") or bucket.get("currency") or default_currency
        bucket["unit"] = row.get("unit") or bucket.get("unit") or default_unit
        for key, value in row.items():
            canonical = _canonical_field(key)
            if canonical in FINANCIAL_FIELDS and isinstance(value, dict):
                bucket[canonical] = value
        if "assets" not in bucket and "total_assets" in bucket:
            bucket["assets"] = bucket["total_assets"]
        if "debt" not in bucket and "total_debt" in bucket:
            bucket["debt"] = bucket["total_debt"]
        if "equity" not in bucket and "total_equity" in bucket:
            bucket["equity"] = bucket["total_equity"]

    return sorted(by_period.values(), key=_period_sort_key)


def unwrap_normalized_value(value: object) -> float | None:
    if isinstance(value, dict):
        normalized = value.get("normalized_value")
        if isinstance(normalized, (int, float)) and not isinstance(normalized, bool):
            return float(normalized)
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _field_record(row: dict[str, Any], field: str) -> dict[str, Any] | None:
    value = row.get(field)
    number = unwrap_normalized_value(value)
    if number is None:
        return None
    source_unit = (value or {}).get("normalized_unit") if isinstance(value, dict) else "raw"
    return {
        "value": number,
        "source_vendor": "normalized_financial_rows",
        "source_field": field,
        "source_unit": source_unit or "raw",
    }


def _financial_period_from_metadata(period: dict[str, Any]) -> Any | None:
    try:
        from tradingagents.financial_highlights.models import FinancialPeriod
    except Exception:
        return None
    year = period.get("fiscal_year")
    if not isinstance(year, int):
        return None
    period_type = str(period.get("period_type") or "annual")
    if period_type not in {"annual", "quarter", "quarterly"}:
        return None
    quarter = period.get("fiscal_quarter")
    is_quarterly = period_type in {"quarter", "quarterly"}
    key = f"FY{str(year)[-2:]}Q{quarter}" if is_quarterly and quarter else f"FY{str(year)[-2:]}"
    label = f"Q{quarter} {year}" if is_quarterly and quarter else f"FY {year}"
    return FinancialPeriod(
        key=key,
        label=label,
        type="quarterly" if is_quarterly else "annual",
        year=year,
        quarter=quarter,
        display_period=label,
        sort_key=period.get("period_end"),
    )


def _dataclass_to_dict(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, list):
        return [_dataclass_to_dict(item) for item in value]
    return value




def _number_like(value: Any) -> float | None:
    if value in (None, "", "N/A", "n/a", "NA", "-") or isinstance(value, bool):
        return None
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _merge_table_metric(
    normalized: dict[str, Any],
    period_key: str | None,
    field: str,
    value: Any,
    *,
    source_vendor: str,
    source_field: str,
    source_unit: str = "raw",
    accumulate: bool = False,
) -> None:
    number = _number_like(value)
    if not period_key or number is None:
        return
    if field in {"capex", "dividend_paid"}:
        number = abs(number)
    bucket = normalized.setdefault("periods", {}).setdefault(period_key, {})
    if field in bucket:
        if accumulate and isinstance(bucket[field].get("value"), (int, float)):
            bucket[field]["value"] = float(bucket[field]["value"]) + number
        return
    bucket[field] = {
        "value": number,
        "source_vendor": source_vendor,
        "source_field": source_field,
        "source_unit": source_unit,
    }
    sources = normalized.setdefault("sources_used", [])
    if source_vendor not in sources:
        sources.append(source_vendor)


def _dividend_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [dict(item) for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("dividends", "corporate_actions", "corporateActions", "data", "rows"):
            value = payload.get(key)
            if isinstance(value, list):
                return [dict(item) for item in value if isinstance(item, dict)]
    return []


def _event_period_keys(row: dict[str, Any]) -> list[str]:
    from datetime import datetime

    date_value = next(
        (row.get(key) for key in ("ex_date", "date", "payment_date", "record_date", "announcement_date") if row.get(key)),
        None,
    )
    try:
        parsed = datetime.fromisoformat(str(date_value)[:10])
    except (TypeError, ValueError):
        return []
    annual = f"FY{str(parsed.year)[-2:]}"
    quarterly = f"{annual}Q{((parsed.month - 1) // 3) + 1}"
    return list(dict.fromkeys([annual, quarterly]))


def _dividend_amount(row: dict[str, Any]) -> float | None:
    for key in ("dividend_per_share", "cash_amount", "amount", "dividend", "cash_dividend"):
        amount = _number_like(row.get(key))
        if amount is not None:
            return abs(amount)
    return None


def _dividend_total(row: dict[str, Any]) -> float | None:
    for key in ("dividend_paid", "total", "total_amount", "dividend_total", "cash_total", "value"):
        total = _number_like(row.get(key))
        if total is not None:
            return abs(total)
    return None


def _merge_dividend_events(normalized: dict[str, Any], dividends: Any) -> None:
    for row in _dividend_rows(dividends):
        amount = _dividend_amount(row)
        total = _dividend_total(row)
        for period_key in _event_period_keys(row):
            if amount is not None:
                _merge_table_metric(
                    normalized,
                    period_key,
                    "dividend_per_share",
                    amount,
                    source_vendor="corporate_actions",
                    source_field="dividend_event.amount",
                    accumulate=True,
                )
            if total is not None:
                _merge_table_metric(
                    normalized,
                    period_key,
                    "dividend_paid",
                    total,
                    source_vendor="corporate_actions",
                    source_field="dividend_event.total",
                    accumulate=True,
                )


def _latest_period_key(periods: list[Any]) -> str | None:
    return periods[-1].key if periods else None

def build_financial_highlights_from_normalized_rows(
    normalized_rows: list[dict[str, Any]],
    *,
    analysis_date: str | None = None,
    currency: str | None = None,
    current_price: float | int | None = None,
    company_profile: dict[str, Any] | None = None,
    dividends: Any | None = None,
) -> dict[str, Any]:
    rows = sorted([dict(row) for row in (normalized_rows or [])], key=_period_sort_key)
    allowed_keys: set[str] | None = None
    resolved_periods: list[Any] | None = None
    if analysis_date:
        try:
            from tradingagents.financial_highlights.period_resolver import resolve_financial_highlight_periods

            resolved_periods = resolve_financial_highlight_periods(analysis_date)
            allowed_keys = {period.key for period in resolved_periods}
        except Exception:
            resolved_periods = None
            allowed_keys = None
    display_rows = []
    for row in rows:
        period = row.get("period") if isinstance(row.get("period"), dict) else {}
        financial_period = _financial_period_from_metadata(period)
        if financial_period is not None and (allowed_keys is None or financial_period.key in allowed_keys):
            display_rows.append(row)
    latest = display_rows[-1] if display_rows else rows[-1] if rows else {}
    latest_period = latest.get("period") if isinstance(latest.get("period"), dict) else {}
    currency = currency or latest_period.get("currency") or latest.get("currency") or "IDR"

    highlights: dict[str, Any] = {
        "period": latest_period,
        "revenue": unwrap_normalized_value(latest.get("revenue")),
        "ebitda": unwrap_normalized_value(latest.get("ebitda")),
        "net_profit": unwrap_normalized_value(latest.get("net_profit")),
        "assets": unwrap_normalized_value(latest.get("assets") or latest.get("total_assets")),
        "equity": unwrap_normalized_value(latest.get("equity") or latest.get("total_equity")),
        "cash": unwrap_normalized_value(latest.get("cash") or latest.get("cash_and_equivalents")),
        "debt": unwrap_normalized_value(latest.get("debt") or latest.get("total_debt")),
        "operating_cash_flow": unwrap_normalized_value(
            latest.get("operating_cash_flow") or latest.get("cash_from_operations")
        ),
        "capex": unwrap_normalized_value(latest.get("capex") or latest.get("capital_expenditure")),
        "normalized_period_rows": rows,
        "source": "normalized_financial_rows",
        "status": "available" if latest else "source_unavailable",
    }

    try:
        from tradingagents.financial_highlights.calculator import build_metric_rows
        from tradingagents.financial_highlights.formatter import currency_metadata
    except Exception:
        return highlights

    periods_by_key: dict[str, Any] = {period.key: period for period in resolved_periods or []}
    normalized_for_table: dict[str, Any] = {
        "currency": currency,
        "periods": {},
        "sources_used": ["normalized_financial_rows"] if rows else [],
    }
    for row in rows:
        period = row.get("period") if isinstance(row.get("period"), dict) else {}
        financial_period = _financial_period_from_metadata(period)
        if financial_period is None:
            continue
        period_key = financial_period.key
        if allowed_keys is None or (period_key in allowed_keys and resolved_periods is None):
            periods_by_key[period_key] = financial_period
        period_values: dict[str, Any] = {}
        for field in FINANCIAL_FIELDS:
            record = _field_record(row, field)
            if record:
                period_values[field] = record
        if "equity" in period_values:
            period_values.setdefault("total_equity", period_values["equity"])
        if "debt" in period_values:
            period_values.setdefault("total_debt", period_values["debt"])
        if "assets" in period_values:
            period_values.setdefault("total_assets", period_values["assets"])
        if "operating_cash_flow" in period_values:
            period_values.setdefault("cash_from_operations", period_values["operating_cash_flow"])
        if "capex" in period_values:
            period_values.setdefault("capital_expenditure", period_values["capex"])
        normalized_for_table["periods"][period_key] = period_values

    periods = (
        resolved_periods
        if resolved_periods is not None
        else sorted(periods_by_key.values(), key=lambda period: str(period.sort_key or ""))
    )
    latest_key = _latest_period_key(periods)
    profile = company_profile or {}
    if latest_key:
        _merge_table_metric(
            normalized_for_table,
            latest_key,
            "reference_price",
            current_price,
            source_vendor="price_data",
            source_field="current_price",
        )
        _merge_table_metric(
            normalized_for_table,
            latest_key,
            "shares_outstanding",
            profile.get("shares_outstanding"),
            source_vendor="company_profile",
            source_field="shares_outstanding",
        )
        _merge_table_metric(
            normalized_for_table,
            latest_key,
            "market_cap",
            profile.get("market_cap"),
            source_vendor="company_profile",
            source_field="market_cap",
        )
    if dividends is not None:
        _merge_dividend_events(normalized_for_table, dividends)
    if periods:
        metric_rows, sections, data_quality = build_metric_rows(periods=periods, normalized=normalized_for_table)
        metadata = currency_metadata(currency)
        highlights.update(
            {
                "title": "Key Financial Highlights",
                "currency": metadata["currency"],
                "currency_label": metadata["currency_label"],
                "scale": metadata["scale"],
                "scale_label": metadata["scale_label"],
                "unit_note": metadata["unit_note"],
                "analysis_date": latest_period.get("as_of_date") or latest_period.get("period_end"),
                "period_logic": "normalized_period_rows",
                "periods": _dataclass_to_dict(periods),
                "point_in_time": [],
                "sections": _dataclass_to_dict(sections),
                "rows": _dataclass_to_dict(metric_rows),
                "notes": [
                    "Financial highlights are built from normalized period rows.",
                    "All amount fields use normalized raw currency units before display scaling.",
                ],
                "data_quality": {
                    **data_quality,
                    "source": "normalized_financial_rows",
                    "latest_period": latest_period.get("period_label"),
                    "as_of_date": latest_period.get("as_of_date"),
                },
            }
        )
    else:
        highlights.update(
            {
                "title": "Key Financial Highlights",
                "currency": currency,
                "currency_label": None,
                "scale": "raw",
                "scale_label": currency,
                "unit_note": f"Currency: {currency}",
                "analysis_date": latest_period.get("as_of_date") or latest_period.get("period_end"),
                "period_logic": "normalized_period_rows",
                "periods": [],
                "point_in_time": [],
                "sections": [],
                "rows": [],
                "notes": [],
                "data_quality": {"status": "unavailable", "source": "normalized_financial_rows"},
            }
        )
    return highlights
