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


def _number_like(value: Any) -> float | None:
    if value in (None, "", "N/A", "n/a", "NA", "-") or isinstance(value, bool):
        return None
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return number if number == number else None


# Public entry points moved into sibling modules (which import core helpers from here).
# Lazy re-export keeps the old `from normalizers import X` path working with no load-time
# cycle. ponytail: PEP 562 hook over a small fixed name→module map.
_LAZY_REEXPORTS = {
    "build_financial_highlights_from_normalized_rows": "highlights",
    "normalize_yfinance_financials": "vendors",
    "normalize_finnhub_financials": "vendors",
    "merge_financial_rows_yfinance_first": "merge",
}


def __getattr__(name: str) -> Any:
    module = _LAZY_REEXPORTS.get(name)
    if module is not None:
        import importlib

        return getattr(importlib.import_module(f".{module}", __package__), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
