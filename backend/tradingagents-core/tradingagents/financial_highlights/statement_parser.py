from __future__ import annotations

import csv
import json
import re
from collections.abc import Iterable, Mapping
from datetime import datetime
from io import StringIO
from typing import Any

from .models import FinancialPeriod

VENDOR_PRIORITY = ("yfinance", "alpha_vantage", "finnhub")

FIELD_ALIASES = {
    "revenue": ("total revenue", "totalrevenue", "revenue", "revenues", "totalRevenue"),
    "ebitda": ("normalized ebitda", "normalizedebitda", "ebitda"),
    "net_profit": (
        "net income common stockholders",
        "netincomecommonstockholders",
        "net income",
        "netincome",
        "netIncome",
        "netIncomeApplicableToCommonShares",
    ),
    "total_equity": (
        "stockholders equity",
        "stockholdersequity",
        "total stockholder equity",
        "totalstockholderequity",
        "total shareholders equity",
        "totalShareholderEquity",
        "total equity",
        "totalequity",
    ),
    "total_debt": ("total debt", "totaldebt", "shortLongTermDebtTotal"),
    "cash": (
        "cash cash equivalents and short term investments",
        "cashcashequivalentsandshortterminvestments",
        "cash and cash equivalents",
        "cashandcashequivalents",
        "cash and short term investments",
        "cashandshortterminvestments",
        "cashAndCashEquivalentsAtCarryingValue",
        "cash",
    ),
    "current_liabilities": ("current liabilities", "currentliabilities", "totalCurrentLiabilities"),
    "total_liabilities": (
        "total liabilities net minority interest",
        "totalliabilitiesnetminorityinterest",
        "total liabilities",
        "totalliabilities",
        "totalLiabilities",
    ),
    "total_assets": ("total assets", "totalassets", "totalAssets"),
    "operating_income": ("operating income", "operatingincome", "operatingIncome"),
    "operating_cash_flow": (
        "operating cash flow",
        "operatingcashflow",
        "total cash from operating activities",
        "totalcashfromoperatingactivities",
        "operatingCashflow",
    ),
    "capex": (
        "capital expenditure",
        "capitalexpenditure",
        "capital expenditures",
        "capitalexpenditures",
        "capitalExpenditures",
    ),
    "dividend_paid": (
        "cash dividends paid",
        "cashdividendspaid",
        "dividends paid",
        "dividendspaid",
        "dividendPayout",
    ),
    "shares_outstanding": (
        "ordinary shares number",
        "ordinarysharesnumber",
        "share issued",
        "shareissued",
        "commonStockSharesOutstanding",
        "shares outstanding",
        "sharesoutstanding",
    ),
    "eps": ("diluted eps", "dilutedeps", "basic eps", "basiceps", "reportedEPS", "eps"),
    "dividend_per_share": ("dividend per share", "dividendpershare", "DividendPerShare"),
    "reference_price": ("reference price", "referenceprice"),
    "dividend_yield": ("dividend yield", "dividendyield", "DividendYield"),
}

NORMALIZED_ALIAS_MAP = {
    re.sub(r"[^a-z0-9]", "", alias.lower()): field for field, aliases in FIELD_ALIASES.items() for alias in aliases
}


def _blank(value: Any) -> bool:
    return value is None or value == "" or value == "None" or value == "null"


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or _blank(value):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip().replace(",", "")
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return number


def _canonical_field(label: Any) -> str | None:
    normalized = re.sub(r"[^a-z0-9]", "", str(label or "").lower())
    exact = NORMALIZED_ALIAS_MAP.get(normalized)
    if exact:
        return exact
    if normalized.startswith(("usgaap", "ifrsfull")):
        for alias, field in NORMALIZED_ALIAS_MAP.items():
            if normalized.endswith(alias):
                return field
    return None


def _fy_key(year: int) -> str:
    return f"FY{str(year)[-2:]}"


def _period_key(value: Any, frequency: str | None = None) -> str | None:
    if isinstance(value, str) and re.fullmatch(r"FY\d{2}(?:Q[1-4])?", value.strip(), flags=re.IGNORECASE):
        return value.strip().upper()
    try:
        parsed = datetime.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None
    annual = str(frequency or "").lower().startswith("a")
    if annual:
        return _fy_key(parsed.year)
    quarter = ((parsed.month - 1) // 3) + 1
    return f"{_fy_key(parsed.year)}Q{quarter}"


def _new_normalized() -> dict[str, Any]:
    return {"currency": None, "periods": {}, "sources_used": []}


def _merge_value(
    normalized: dict[str, Any],
    period_key: str | None,
    field: str | None,
    value: Any,
    *,
    source_vendor: str,
    source_field: str,
    source_unit: str | None = None,
) -> None:
    number = _number(value)
    if not period_key or not field or number is None:
        return
    if field in {"capex", "dividend_paid"}:
        number = abs(number)
    period_values = normalized["periods"].setdefault(period_key, {})
    if field in period_values:
        return
    period_values[field] = {
        "value": number,
        "source_vendor": source_vendor,
        "source_field": source_field,
        "source_unit": source_unit,
    }
    if source_vendor not in normalized["sources_used"]:
        normalized["sources_used"].append(source_vendor)


def _load_mapping(payload: Any) -> Mapping[str, Any] | None:
    if isinstance(payload, Mapping):
        return payload
    if not isinstance(payload, str):
        return None
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, Mapping) else None


def _detect_vendor(payload: Any) -> str:
    text = str(payload or "").lower()
    if '"source": "finnhub"' in text or '"source":"finnhub"' in text or '"reports"' in text:
        return "finnhub"
    if "annualreports" in text or "quarterlyreports" in text or "alphavantage" in text:
        return "alpha_vantage"
    return "yfinance"


def _parse_direct_period_mapping(
    payload: Mapping[str, Any],
    normalized: dict[str, Any],
    vendor: str,
) -> bool:
    periods = payload.get("periods") if isinstance(payload.get("periods"), Mapping) else payload
    keys = [str(key).upper() for key in periods]
    if not keys or not all(re.fullmatch(r"FY\d{2}(?:Q[1-4])?", key) for key in keys):
        return False

    for raw_period_key, raw_values in periods.items():
        if not isinstance(raw_values, Mapping):
            continue
        period_key = str(raw_period_key).upper()
        for raw_field, raw_value in raw_values.items():
            field = _canonical_field(raw_field) or str(raw_field)
            source_vendor = vendor
            source_field = str(raw_field)
            value = raw_value
            if isinstance(raw_value, Mapping):
                value = raw_value.get("value")
                source_vendor = str(raw_value.get("source_vendor") or vendor)
                source_field = str(raw_value.get("source_field") or raw_field)
                source_unit = str(raw_value.get("source_unit") or raw_value.get("unit") or "raw")
            else:
                source_unit = "raw"
            _merge_value(
                normalized,
                period_key,
                field,
                value,
                source_vendor=source_vendor,
                source_field=source_field,
                source_unit=source_unit,
            )
    return True


def _parse_tabular_statement(
    payload: Any,
    normalized: dict[str, Any],
    vendor: str,
    frequency: str | None,
) -> bool:
    if hasattr(payload, "to_csv"):
        payload = payload.to_csv()
    if not isinstance(payload, str) or "," not in payload:
        return False
    rows = [line for line in payload.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if len(rows) < 2:
        return False
    try:
        parsed_rows = list(csv.reader(StringIO("\n".join(rows))))
    except csv.Error:
        return False
    if not parsed_rows or len(parsed_rows[0]) < 2:
        return False
    headers = parsed_rows[0][1:]
    found = False
    for row in parsed_rows[1:]:
        if not row:
            continue
        field = _canonical_field(row[0])
        if not field:
            continue
        for header, value in zip(headers, row[1:], strict=False):
            period_key = _period_key(header, frequency)
            before = len(normalized["periods"].get(period_key or "", {}))
            _merge_value(
                normalized,
                period_key,
                field,
                value,
                source_vendor=vendor,
                source_field=row[0],
            )
            found = found or len(normalized["periods"].get(period_key or "", {})) > before
    return found


def _parse_alpha_vantage_statement(
    payload: Mapping[str, Any],
    normalized: dict[str, Any],
    vendor: str,
) -> bool:
    found = False
    for report_key, frequency in (("annualReports", "annual"), ("quarterlyReports", "quarterly")):
        reports = payload.get(report_key)
        if not isinstance(reports, list):
            continue
        for report in reports:
            if not isinstance(report, Mapping):
                continue
            period_key = _period_key(report.get("fiscalDateEnding"), frequency)
            for raw_field, value in report.items():
                field = _canonical_field(raw_field)
                before = len(normalized["periods"].get(period_key or "", {}))
                _merge_value(
                    normalized,
                    period_key,
                    field,
                    value,
                    source_vendor=vendor,
                    source_field=str(raw_field),
                )
                found = found or len(normalized["periods"].get(period_key or "", {})) > before
    return found


def _iter_finnhub_fields(value: Any) -> Iterable[tuple[str, Any]]:
    if isinstance(value, list):
        for item in value:
            yield from _iter_finnhub_fields(item)
        return
    if not isinstance(value, Mapping):
        return
    labels = (value.get("label"), value.get("concept"))
    if "value" in value:
        for label in labels:
            if label:
                yield str(label), value.get("value")
    for nested in value.values():
        if isinstance(nested, (Mapping, list)):
            yield from _iter_finnhub_fields(nested)


def _parse_finnhub_statement(
    payload: Mapping[str, Any],
    normalized: dict[str, Any],
    vendor: str,
) -> bool:
    reports = payload.get("reports")
    if not isinstance(reports, list):
        return False
    found = False
    for report in reports:
        if not isinstance(report, Mapping):
            continue
        frequency = "quarterly" if report.get("quarter") else "annual"
        period_key = _period_key(report.get("endDate") or report.get("fiscalDateEnding"), frequency)
        for raw_field, value in _iter_finnhub_fields(report.get("report")):
            field = _canonical_field(raw_field)
            before = len(normalized["periods"].get(period_key or "", {}))
            _merge_value(
                normalized,
                period_key,
                field,
                value,
                source_vendor=vendor,
                source_field=raw_field,
            )
            found = found or len(normalized["periods"].get(period_key or "", {})) > before
    return found


def _parse_statement(
    payload: Any,
    normalized: dict[str, Any],
    vendor: str,
    frequency: str | None,
) -> None:
    mapping = _load_mapping(payload)
    if mapping is not None:
        if _parse_direct_period_mapping(mapping, normalized, vendor):
            return
        if _parse_alpha_vantage_statement(mapping, normalized, vendor):
            return
        if _parse_finnhub_statement(mapping, normalized, vendor):
            return
    _parse_tabular_statement(payload, normalized, vendor, frequency)


def _collect_statement_payloads(
    grouped: dict[str, list[tuple[Any, str | None]]],
    payload: Any,
    *,
    hinted_vendor: str | None = None,
    frequency: str | None = None,
) -> None:
    if payload is None:
        return
    if isinstance(payload, str) and "# Financial statement frequency:" in payload:
        sections = re.split(r"(?=# Financial statement frequency:)", payload)
        for section in sections:
            match = re.match(r"# Financial statement frequency:\s*(annual|quarterly)", section)
            if match:
                _collect_statement_payloads(
                    grouped,
                    section[match.end() :].strip(),
                    hinted_vendor=hinted_vendor,
                    frequency=match.group(1),
                )
        return
    mapping = payload if isinstance(payload, Mapping) else _load_mapping(payload)
    if isinstance(mapping, Mapping):
        used_wrapper = False
        for key, item_frequency in (("annual", "annual"), ("quarterly", "quarterly")):
            if key in mapping:
                _collect_statement_payloads(
                    grouped,
                    mapping[key],
                    hinted_vendor=hinted_vendor,
                    frequency=item_frequency,
                )
                used_wrapper = True
        if used_wrapper:
            return
    vendor = hinted_vendor or _detect_vendor(payload)
    grouped.setdefault(vendor, []).append((payload, frequency))


def _currency_from_payload(payload: Any) -> str | None:
    mapping = _load_mapping(payload)
    if not mapping:
        return None
    currency = mapping.get("Currency") or mapping.get("currency")
    if not currency and isinstance(mapping.get("company"), Mapping):
        currency = mapping["company"].get("currency")
    return str(currency).upper() if currency else None


def _last_close_on_or_before(price_data: Any, analysis_date: Any) -> float | None:
    if hasattr(price_data, "to_csv"):
        price_data = price_data.to_csv()
    if not isinstance(price_data, str) or "," not in price_data:
        return None
    lines = [line for line in price_data.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if len(lines) < 2:
        return None
    try:
        rows = csv.DictReader(StringIO("\n".join(lines)))
        field_map = {re.sub(r"[^a-z0-9]", "", field.lower()): field for field in rows.fieldnames or []}
    except csv.Error:
        return None
    date_field = next((field_map[key] for key in ("date", "datetime", "timestamp") if key in field_map), None)
    close_field = field_map.get("close")
    if not date_field or not close_field:
        return None
    try:
        cutoff = datetime.fromisoformat(str(analysis_date)[:10]).date()
    except (TypeError, ValueError):
        cutoff = None
    last_date = None
    last_close = None
    for row in rows:
        try:
            row_date = datetime.fromisoformat(str(row.get(date_field) or "")[:10]).date()
        except ValueError:
            continue
        close = _number(row.get(close_field))
        if close is None or (cutoff is not None and row_date > cutoff):
            continue
        if last_date is None or row_date >= last_date:
            last_date = row_date
            last_close = close
    return last_close


def _add_reference_price(
    normalized: dict[str, Any],
    periods: list[FinancialPeriod],
    price_data: Any,
    analysis_date: Any,
) -> None:
    reference_price = _last_close_on_or_before(price_data, analysis_date)
    if reference_price is None or not periods:
        return
    target_period = next(
        (
            period
            for period in reversed(periods)
            if normalized.get("periods", {}).get(period.key, {}).get("dividend_per_share")
        ),
        periods[-1],
    )
    _merge_value(
        normalized,
        target_period.key,
        "reference_price",
        reference_price,
        source_vendor="price_data",
        source_field="last_close_on_or_before_analysis_date",
    )


def parse_vendor_financials(
    *,
    ticker: str,
    periods: list[FinancialPeriod],
    fundamentals: dict[str, Any] | str | None = None,
    income_statement: Any | None = None,
    balance_sheet: Any | None = None,
    cashflow: Any | None = None,
    price_data: Any | None = None,
    analysis_date: Any | None = None,
    dividends: Any | None = None,
    vendor_payloads: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = _new_normalized()
    grouped: dict[str, list[tuple[Any, str | None]]] = {vendor: [] for vendor in VENDOR_PRIORITY}

    for payload in (income_statement, balance_sheet, cashflow, dividends):
        _collect_statement_payloads(grouped, payload)

    for vendor, bundle in (vendor_payloads or {}).items():
        if vendor not in VENDOR_PRIORITY or not isinstance(bundle, Mapping):
            continue
        for field in ("income_statement", "balance_sheet", "cashflow", "dividends"):
            _collect_statement_payloads(grouped, bundle.get(field), hinted_vendor=vendor)
        normalized["currency"] = normalized["currency"] or _currency_from_payload(bundle.get("fundamentals"))

    normalized["currency"] = normalized["currency"] or _currency_from_payload(fundamentals)
    if not normalized["currency"]:
        normalized["currency"] = "IDR" if str(ticker).upper().endswith(".JK") else "USD"

    for vendor in VENDOR_PRIORITY:
        for payload, frequency in grouped.get(vendor, []):
            _parse_statement(payload, normalized, vendor, frequency)

    _add_reference_price(normalized, periods, price_data, analysis_date)
    return normalized
