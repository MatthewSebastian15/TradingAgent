"""Unit, currency, and period normalization for financial statement values."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, is_dataclass
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
    "cost_of_revenue",
    "operating_profit",
    "ebitda",
    "operating_income",
    "operating_expense",
    "pretax_income",
    "income_tax_expense",
    "net_profit",
    "interest_expense",
    "operating_cash_flow",
    "cash_from_operations",
    "investing_cash_flow",
    "financing_cash_flow",
    "capex",
    "capital_expenditure",
    "free_cash_flow",
    "depreciation_amortization",
    "change_in_working_capital",
    "stock_based_compensation",
    "share_repurchase",
    "cash",
    "cash_and_equivalents",
    "debt",
    "total_debt",
    "equity",
    "total_equity",
    "assets",
    "total_assets",
    "total_liabilities",
    "current_assets",
    "current_liabilities",
    "working_capital",
    "invested_capital",
    "inventory",
    "shares_outstanding",
    "float_shares",
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
    "peg_ratio",
    "beta",
    "current_ratio",
    "quick_ratio",
    "revenue_per_share",
    "cash_per_share",
    "payout_ratio",
    "roe",
    "roa",
    "ev_sales",
    "price_fcf",
    "ev_fcf",
    "earnings_yield",
    "fcf_yield",
}

_FIELD_ALIASES = {
    "total_assets": "assets",
    "total_equity": "equity",
    "total_equity_gross_minority_interest": "equity",
    "stockholders_equity": "equity",
    "shareholders_equity": "equity",
    "common_stock_equity": "equity",
    "total_shareholder_equity": "equity",
    "total_shareholders_equity": "equity",
    "total_debt": "debt",
    "long_term_debt_and_capital_lease_obligation": "debt",
    "long_term_debt": "debt",
    "short_long_term_debt_total": "debt",
    "cash_from_operations": "operating_cash_flow",
    "total_cash_from_operating_activities": "operating_cash_flow",
    "operating_cashflow": "operating_cash_flow",
    "cash_flow_from_continuing_operating_activities": "operating_cash_flow",
    "investing_cash_flow": "investing_cash_flow",
    "cash_flow_from_continuing_investing_activities": "investing_cash_flow",
    "financing_cash_flow": "financing_cash_flow",
    "cash_flow_from_continuing_financing_activities": "financing_cash_flow",
    "capital_expenditure": "capex",
    "capital_expenditures": "capex",
    "depreciation_and_amortization": "depreciation_amortization",
    "depreciation_amortization_depletion": "depreciation_amortization",
    "change_in_working_capital": "change_in_working_capital",
    "changes_in_working_capital": "change_in_working_capital",
    "stock_based_compensation": "stock_based_compensation",
    "repurchase_of_capital_stock": "share_repurchase",
    "repurchase_of_common_stock": "share_repurchase",
    "net_income": "net_profit",
    "net_income_common_stockholders": "net_profit",
    "net_income_continuous_operations": "net_profit",
    "total_revenue": "revenue",
    "revenue": "revenue",
    "operating_revenue": "revenue",
    "gross_profit": "gross_profit",
    "gross_profit_loss": "gross_profit",
    "cost_of_revenue": "cost_of_revenue",
    "cost_of_goods_sold": "cost_of_revenue",
    "pretax_income": "pretax_income",
    "income_before_tax": "pretax_income",
    "tax_provision": "income_tax_expense",
    "income_tax_expense": "income_tax_expense",
    "operating_income": "operating_income",
    "operating_profit": "operating_profit",
    "operating_expense": "operating_expense",
    "operating_expenses": "operating_expense",
    "total_operating_expenses": "operating_expense",
    "total_operating_expense": "operating_expense",
    "operating_costs": "operating_expense",
    "income_from_operations": "operating_income",
    "ebit": "operating_income",
    "ebitda": "ebitda",
    "interest_expense": "interest_expense",
    "interest_expense_non_operating": "interest_expense",
    "cash_and_cash_equivalents": "cash",
    "cash_cash_equivalents_and_short_term_investments": "cash",
    "cash_financial": "cash",
    "cash_equivalents": "cash",
    "cash_and_short_term_investments": "cash",
    "cash_and_equivalents": "cash",
    "cash_cash_equivalents_and_federal_funds_sold": "cash",
    "current_assets": "current_assets",
    "total_current_assets": "current_assets",
    "working_capital": "working_capital",
    "invested_capital": "invested_capital",
    "inventory": "inventory",
    "inventories": "inventory",
    "total_current_liabilities": "current_liabilities",
    "total_liabilities_net_minority_interest": "total_liabilities",
    "ordinary_shares_number": "shares_outstanding",
    "share_issued": "shares_outstanding",
    "common_stock_shares_outstanding": "shares_outstanding",
    "shares_outstanding": "shares_outstanding",
    "float_shares": "float_shares",
    "floatshares": "float_shares",
    "diluted_eps": "eps",
    "basic_eps": "eps",
    "reported_eps": "eps",
    "eps_basic": "eps",
    "eps_diluted": "eps",
    "cash_dividends_paid": "dividend_paid",
    "common_stock_dividend_paid": "dividend_paid",
    "cash_dividends_paid_direct": "dividend_paid",
    "dividends_paid": "dividend_paid",
    "dividend_payout": "dividend_paid",
    "dividend_per_share": "dividend_per_share",
    "dividendpershare": "dividend_per_share",
    "reference_price": "reference_price",
    "last_close": "reference_price",
    "close": "reference_price",
    "market_capitalization": "market_cap",
    "market_cap": "market_cap",
    "enterprise_value": "enterprise_value",
    "p_e": "pe",
    "pe_ratio": "pe",
    "trailingpe": "pe",
    "forwardpe": "pe",
    "p_bv": "pbv",
    "p_b": "pbv",
    "pb_ratio": "pbv",
    "price_to_book": "pbv",
    "pricetobook": "pbv",
    "p_s": "ps",
    "ps_ratio": "ps",
    "price_to_sales": "ps",
    "pricetosalestrailing12months": "ps",
    "ev_ebitda": "ev_ebitda",
    "enterprise_value_to_ebitda": "ev_ebitda",
    "enterprisetoebitda": "ev_ebitda",
    "peg_ratio": "peg_ratio",
    "pegratio": "peg_ratio",
    "beta": "beta",
    "current_ratio": "current_ratio",
    "quick_ratio": "quick_ratio",
    "revenue_per_share": "revenue_per_share",
    "total_cash_per_share": "cash_per_share",
    "cash_per_share": "cash_per_share",
    "payout_ratio": "payout_ratio",
    "payoutratio": "payout_ratio",
    "return_on_equity": "roe",
    "returnonequity": "roe",
    "roe": "roe",
    "return_on_assets": "roa",
    "returnonassets": "roa",
    "roa": "roa",
    "enterprise_to_revenue": "ev_sales",
    "enterprisetorevenue": "ev_sales",
    "ev_sales": "ev_sales",
    "price_to_free_cash_flow": "price_fcf",
    "pricetofreecashflow": "price_fcf",
    "price_fcf": "price_fcf",
    "enterprise_to_free_cash_flow": "ev_fcf",
    "enterprisetofreecashflow": "ev_fcf",
    "ev_fcf": "ev_fcf",
    "earnings_yield": "earnings_yield",
    "earningsyield": "earnings_yield",
    "fcf_yield": "fcf_yield",
    "fcfyield": "fcf_yield",
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


def normalize_financial_field(
    value: Any, unit: str = "raw", currency: str = "IDR"
) -> dict[str, Any]:
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
                item[field] = normalize_financial_field(
                    value, unit=item["unit"], currency=item["currency"]
                )
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


def _row_from_period_mapping(
    period_label: str, values: Any, period_type_hint: str
) -> dict[str, Any] | None:
    if not isinstance(values, dict):
        return None
    row = {"period_label": period_label, "period_type": period_type_hint}
    for raw_key, raw_value in values.items():
        if isinstance(raw_value, dict):
            value = raw_value.get(
                "normalized_value", raw_value.get("value", raw_value.get("raw_value"))
            )
            row[_canonical_field(raw_key)] = value
            if raw_value.get("source_unit") or raw_value.get("unit") or raw_value.get("raw_unit"):
                row.setdefault(
                    "unit",
                    raw_value.get("source_unit")
                    or raw_value.get("unit")
                    or raw_value.get("raw_unit"),
                )
            if (
                raw_value.get("currency")
                or raw_value.get("raw_currency")
                or raw_value.get("normalized_currency")
            ):
                row.setdefault(
                    "currency",
                    raw_value.get("currency")
                    or raw_value.get("raw_currency")
                    or raw_value.get("normalized_currency"),
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

    if mapping and all(
        _looks_like_period_key(key) and isinstance(value, dict) for key, value in mapping.items()
    ):
        for label, values in mapping.items():
            row = _row_from_period_mapping(str(label), values, default_period_type)
            if row:
                rows.append(row)

    if not rows and any(
        _canonical_field(key) in FINANCIAL_FIELDS
        or key in {"period", "period_label", "fiscalDateEnding"}
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
            row[field] = normalize_financial_field(
                value, unit=unit or default_unit, currency=currency
            )
        rows.append(row)
    return rows


def _period_sort_key(row: dict[str, Any]) -> tuple[str, str]:
    period = row.get("period") if isinstance(row.get("period"), dict) else {}
    return (
        str(period.get("period_end") or ""),
        str(period.get("period_label") or row.get("period_label") or ""),
    )


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


_FINANCIAL_ROW_FIELD_ALIASES = {
    "assets": "total_assets",
    "total_assets": "total_assets",
    "liabilities": "total_liabilities",
    "total_liabilities": "total_liabilities",
    "equity": "equity",
    "total_equity": "equity",
    "debt": "total_debt",
    "total_debt": "total_debt",
    "cash": "cash_and_equivalents",
    "cash_and_equivalents": "cash_and_equivalents",
    "cash_from_operations": "operating_cash_flow",
    "operating_cash_flow": "operating_cash_flow",
    "capital_expenditure": "capex",
    "capital_expenditures": "capex",
    "capex": "capex",
    "operating_income": "operating_profit",
    "operating_profit": "operating_profit",
    "operating_expense": "operating_expense",
    "operating_expenses": "operating_expense",
    "total_operating_expenses": "operating_expense",
}

_FINNHUB_FIELD_ALIASES = {
    "revenue": "revenue",
    "revenues": "revenue",
    "total_revenue": "revenue",
    "totalrevenue": "revenue",
    "gross_profit": "gross_profit",
    "grossprofit": "gross_profit",
    "operating_income": "operating_profit",
    "operatingincome": "operating_profit",
    "ebit": "operating_profit",
    "operating_expense": "operating_expense",
    "operatingexpense": "operating_expense",
    "operating_expenses": "operating_expense",
    "operatingexpenses": "operating_expense",
    "total_operating_expenses": "operating_expense",
    "totaloperatingexpenses": "operating_expense",
    "ebitda": "ebitda",
    "net_income": "net_profit",
    "netincome": "net_profit",
    "net_profit": "net_profit",
    "eps": "eps",
    "eps_basic": "eps",
    "eps_diluted": "eps",
    "interest_expense": "interest_expense",
    "interestexpense": "interest_expense",
    "total_assets": "total_assets",
    "totalassets": "total_assets",
    "total_liabilities": "total_liabilities",
    "totalliabilities": "total_liabilities",
    "total_equity": "equity",
    "totalequity": "equity",
    "shareholders_equity": "equity",
    "stockholders_equity": "equity",
    "current_assets": "current_assets",
    "total_current_assets": "current_assets",
    "totalcurrentassets": "current_assets",
    "current_liabilities": "current_liabilities",
    "total_current_liabilities": "current_liabilities",
    "totalcurrentliabilities": "current_liabilities",
    "total_debt": "total_debt",
    "totaldebt": "total_debt",
    "cash": "cash_and_equivalents",
    "cash_and_equivalents": "cash_and_equivalents",
    "cashandcashequivalents": "cash_and_equivalents",
    "operating_cash_flow": "operating_cash_flow",
    "cash_from_operations": "operating_cash_flow",
    "net_cash_provided_by_operating_activities": "operating_cash_flow",
    "netcashprovidedbyoperatingactivities": "operating_cash_flow",
    "capex": "capex",
    "capital_expenditure": "capex",
    "capitalexpenditure": "capex",
    "capital_expenditures": "capex",
    "free_cash_flow": "free_cash_flow",
    "freecashflow": "free_cash_flow",
    "shares_outstanding": "shares_outstanding",
    "shareoutstanding": "shares_outstanding",
    "weighted_average_shs_out": "shares_outstanding",
}


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


def _copy_financial_row(row: FinancialRow) -> FinancialRow:
    return FinancialRow(**row.to_dict())


def _period_key(row: FinancialRow) -> tuple[str, str]:
    return (str(row.period_type or ""), str(row.period or ""))


def _field_quality_entry(
    *,
    source: str | None,
    confidence: str,
    fallback: bool = False,
    fallback_source: str | None = None,
    estimated: bool = False,
    as_of_date: str | None = None,
    unavailable_reason: str | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "source": source,
        "confidence": confidence,
        "estimated": estimated,
        "fallback": fallback,
        "as_of_date": as_of_date,
    }
    if fallback_source:
        entry["fallback_source"] = fallback_source
    if unavailable_reason:
        entry["unavailable_reason"] = unavailable_reason
    return entry


def merge_financial_rows_yfinance_first(
    yfinance_rows: list[FinancialRow] | None,
    finnhub_rows: list[FinancialRow] | None,
) -> dict[str, Any]:
    """Merge normalized rows with YFinance primary and Finnhub fallback only."""
    primary_rows = list(yfinance_rows or [])
    fallback_rows = list(finnhub_rows or [])
    fallback_by_period = {_period_key(row): row for row in fallback_rows}
    merged_rows: list[FinancialRow] = []
    filled_by_fallback: list[str] = []
    warnings: list[str] = []
    field_quality: dict[str, dict[str, Any]] = {}

    for primary in primary_rows:
        merged = _copy_financial_row(primary)
        fallback = fallback_by_period.pop(_period_key(primary), None)
        for field in FINANCIAL_ROW_FIELDS:
            primary_value = getattr(merged, field)
            fallback_value = getattr(fallback, field) if fallback else None
            if primary_value is not None:
                field_quality[field] = _field_quality_entry(
                    source="yfinance",
                    confidence=merged.source_confidence or "high",
                    fallback=False,
                    as_of_date=merged.as_of_date,
                )
                if fallback_value is not None:
                    message = f"{field} available from yfinance and finnhub; kept yfinance."
                    warnings.append(message)
                    merged.warnings.append(message)
                continue
            if fallback_value is not None:
                setattr(merged, field, fallback_value)
                merged.fallback = True
                merged.fallback_source = "finnhub"
                merged.source = "mixed"
                merged.source_confidence = "medium"
                filled_by_fallback.append(field)
                field_quality[field] = _field_quality_entry(
                    source="finnhub",
                    confidence="medium",
                    fallback=True,
                    fallback_source="finnhub",
                    as_of_date=fallback.as_of_date,
                )
                continue
            field_quality.setdefault(
                field,
                _field_quality_entry(
                    source=None,
                    confidence="unavailable",
                    as_of_date=merged.as_of_date,
                    unavailable_reason="field_not_returned_by_yfinance_or_finnhub",
                ),
            )
        merged_rows.append(merged)

    for fallback in fallback_by_period.values():
        row = _copy_financial_row(fallback)
        row.fallback = True
        row.fallback_source = "finnhub"
        row.warnings.append(
            "Entire period supplied by Finnhub fallback because YFinance period was unavailable."
        )
        for field in FINANCIAL_ROW_FIELDS:
            if getattr(row, field) is not None:
                filled_by_fallback.append(field)
                field_quality.setdefault(
                    field,
                    _field_quality_entry(
                        source="finnhub",
                        confidence="medium",
                        fallback=True,
                        fallback_source="finnhub",
                        as_of_date=row.as_of_date,
                    ),
                )
        merged_rows.append(row)

    missing_fields = sorted(
        field
        for field in FINANCIAL_ROW_FIELDS
        if not any(getattr(row, field) is not None for row in merged_rows)
    )
    fallback_used = bool(filled_by_fallback)
    metadata = {
        "source": "mixed"
        if fallback_used
        else "yfinance"
        if primary_rows
        else "finnhub"
        if fallback_rows
        else "unavailable",
        "source_priority": ["yfinance", "finnhub"],
        "fallback_used": fallback_used,
        "fallback_source": "finnhub" if fallback_used else None,
        "missing_fields": missing_fields,
        "filled_by_fallback": sorted(set(filled_by_fallback)),
        "warnings": list(dict.fromkeys(warnings)),
    }
    return {"rows": merged_rows, "metadata": metadata, "field_quality": field_quality}


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
    if field in {"capex", "dividend_paid", "share_repurchase"}:
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


def _date_key_rows(mapping: dict[Any, Any]) -> list[dict[str, Any]]:
    from datetime import datetime

    rows: list[dict[str, Any]] = []
    for raw_date, raw_value in mapping.items():
        try:
            datetime.fromisoformat(str(raw_date)[:10])
        except (TypeError, ValueError):
            return []
        if isinstance(raw_value, dict):
            item = dict(raw_value)
            item.setdefault("date", raw_date)
            rows.append(item)
        else:
            rows.append({"date": raw_date, "dividend_per_share": raw_value})
    return rows


def _csv_dividend_rows(payload: str) -> list[dict[str, Any]]:
    import csv
    from io import StringIO

    lines = [
        line for line in payload.splitlines() if line.strip() and not line.lstrip().startswith("#")
    ]
    if len(lines) < 2 or "," not in payload:
        return []
    try:
        reader = csv.DictReader(StringIO("\n".join(lines)))
    except csv.Error:
        return []
    rows: list[dict[str, Any]] = []
    for row in reader:
        item = dict(row or {})
        if item.get("") and not item.get("date"):
            item["date"] = item[""]
        rows.append(item)
    return rows


def _dividend_rows(payload: Any) -> list[dict[str, Any]]:
    if hasattr(payload, "to_csv"):
        payload = payload.to_csv()
    if isinstance(payload, list):
        return [dict(item) for item in payload if isinstance(item, dict)]
    if isinstance(payload, str):
        loaded = _load_mapping(payload)
        if isinstance(loaded, dict):
            payload = loaded
        else:
            return _csv_dividend_rows(payload)
    if isinstance(payload, dict):
        for key in (
            "dividends",
            "Dividends",
            "corporate_actions",
            "corporateActions",
            "data",
            "rows",
        ):
            value = payload.get(key)
            if isinstance(value, list):
                return [dict(item) for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                return _date_key_rows(value)
            if isinstance(value, str):
                return _csv_dividend_rows(value)
        return _date_key_rows(payload)
    return []


def _event_period_keys(row: dict[str, Any]) -> list[str]:
    from datetime import datetime

    date_value = next(
        (
            row.get(key)
            for key in (
                "ex_date",
                "date",
                "Date",
                "payment_date",
                "record_date",
                "announcement_date",
                "",
            )
            if row.get(key)
        ),
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
    for key in (
        "dividend_per_share",
        "Dividend Per Share",
        "Dividends",
        "cash_amount",
        "amount",
        "dividend",
        "cash_dividend",
    ):
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
    price_data: Any | None = None,
    company_profile: dict[str, Any] | None = None,
    dividends: Any | None = None,
) -> dict[str, Any]:
    rows = sorted([dict(row) for row in (normalized_rows or [])], key=_period_sort_key)
    allowed_keys: set[str] | None = None
    resolved_periods: list[Any] | None = None
    if analysis_date:
        try:
            from tradingagents.financial_highlights.period_resolver import (
                resolve_financial_highlight_periods,
            )

            resolved_periods = resolve_financial_highlight_periods(analysis_date)
            allowed_keys = {period.key for period in resolved_periods}
        except Exception:
            resolved_periods = None
            allowed_keys = None
    display_rows = []
    for row in rows:
        period = row.get("period") if isinstance(row.get("period"), dict) else {}
        financial_period = _financial_period_from_metadata(period)
        if financial_period is not None and (
            allowed_keys is None or financial_period.key in allowed_keys
        ):
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
        if "operating_profit" in period_values:
            period_values.setdefault("operating_income", period_values["operating_profit"])
        if "operating_cash_flow" in period_values:
            period_values.setdefault("cash_from_operations", period_values["operating_cash_flow"])
        if "capex" in period_values:
            period_values.setdefault("capital_expenditure", period_values["capex"])
        if "cash" in period_values:
            period_values.setdefault("cash_and_equivalents", period_values["cash"])
        if "dividend_paid" in period_values:
            period_values.setdefault("cash_dividends_paid", period_values["dividend_paid"])
        normalized_for_table["periods"][period_key] = period_values

    periods = (
        resolved_periods
        if resolved_periods is not None
        else sorted(periods_by_key.values(), key=lambda period: str(period.sort_key or ""))
    )
    profile = company_profile or {}
    if periods and price_data is not None:
        try:
            from tradingagents.financial_highlights.statement_parser import (
                reference_prices_by_period,
            )

            for period_key, reference_price in reference_prices_by_period(
                periods, price_data, analysis_date
            ).items():
                _merge_table_metric(
                    normalized_for_table,
                    period_key,
                    "reference_price",
                    reference_price,
                    source_vendor="price_data",
                    source_field="last_close_on_or_before_period_end",
                )
        except Exception:
            # ponytail: reference-price enrichment is optional; skip if pricing lookup fails
            pass
    shares_outstanding = profile.get("shares_outstanding") or profile.get("sharesOutstanding")
    for period in periods:
        _merge_table_metric(
            normalized_for_table,
            period.key,
            "shares_outstanding",
            shares_outstanding,
            source_vendor="company_profile",
            source_field="shares_outstanding",
        )

    latest_key = _latest_period_key(periods)
    if latest_key:
        _merge_table_metric(
            normalized_for_table,
            latest_key,
            "reference_price",
            current_price,
            source_vendor="price_data",
            source_field="current_price",
        )
        profile_metric_fields = {
            "shares_outstanding": ("shares_outstanding", "sharesOutstanding"),
            "market_cap": ("market_cap", "marketCap"),
            "enterprise_value": ("enterprise_value", "enterpriseValue"),
            "pe": ("trailing_pe", "trailingPE", "forward_pe", "forwardPE"),
            "pbv": ("price_to_book", "priceToBook"),
            "ps": ("price_to_sales", "priceToSalesTrailing12Months"),
            "ev_ebitda": ("enterprise_to_ebitda", "enterpriseToEbitda"),
            "dividend_yield": ("dividend_yield", "dividendYield"),
            "peg_ratio": ("peg_ratio", "pegRatio"),
            "beta": ("beta",),
            "float_shares": ("float_shares", "floatShares"),
            "current_ratio": ("current_ratio", "currentRatio"),
            "quick_ratio": ("quick_ratio", "quickRatio"),
            "revenue_per_share": ("revenue_per_share", "revenuePerShare"),
            "cash_per_share": ("total_cash_per_share", "totalCashPerShare"),
            "payout_ratio": ("payout_ratio", "payoutRatio"),
            "roe": ("return_on_equity", "returnOnEquity"),
            "roa": ("return_on_assets", "returnOnAssets"),
            "ev_sales": ("enterprise_to_revenue", "enterpriseToRevenue"),
            "price_fcf": ("price_to_free_cash_flow", "priceToFreeCashflow", "priceToFreeCashFlow"),
            "ev_fcf": ("enterprise_to_fcf", "enterpriseToFcf", "enterpriseToFreeCashFlow"),
            "earnings_yield": ("earnings_yield", "earningsYield"),
            "fcf_yield": ("fcf_yield", "free_cash_flow_yield", "freeCashFlowYield"),
        }
        for field_name, source_keys in profile_metric_fields.items():
            value = next(
                (profile.get(key) for key in source_keys if profile.get(key) is not None), None
            )
            _merge_table_metric(
                normalized_for_table,
                latest_key,
                field_name,
                value,
                source_vendor="company_profile",
                source_field=source_keys[0],
            )
    if dividends is not None:
        _merge_dividend_events(normalized_for_table, dividends)
    if periods:
        metric_rows, sections, data_quality = build_metric_rows(
            periods=periods,
            normalized=normalized_for_table,
            include_operating_expense=True,
        )
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
