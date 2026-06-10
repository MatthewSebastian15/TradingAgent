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
    "revenue": (
        "total revenue",
        "totalrevenue",
        "operating revenue",
        "operatingrevenue",
        "revenue",
        "revenues",
        "totalRevenue",
    ),
    "ebitda": ("normalized ebitda", "normalizedebitda", "ebitda"),
    "net_profit": (
        "net income common stockholders",
        "netincomecommonstockholders",
        "net income continuous operations",
        "netincomecontinuousoperations",
        "net income",
        "netincome",
        "netIncome",
        "netIncomeApplicableToCommonShares",
    ),
    "total_equity": (
        "stockholders equity",
        "stockholdersequity",
        "total equity gross minority interest",
        "totalequitygrossminorityinterest",
        "common stock equity",
        "commonstockequity",
        "total stockholder equity",
        "totalstockholderequity",
        "total shareholder equity",
        "totalshareholderequity",
        "total shareholders equity",
        "totalshareholdersequity",
        "totalShareholderEquity",
        "total equity",
        "totalequity",
    ),
    "total_debt": (
        "total debt",
        "totaldebt",
        "long term debt and capital lease obligation",
        "longtermdebtandcapitalleaseobligation",
        "long term debt",
        "longtermdebt",
        "short long term debt total",
        "shortlongtermdebttotal",
        "shortLongTermDebtTotal",
    ),
    "cash": (
        "cash and cash equivalents",
        "cashandcashequivalents",
        "cash cash equivalents and short term investments",
        "cashcashequivalentsandshortterminvestments",
        "cash financial",
        "cashfinancial",
        "cash equivalents",
        "cashequivalents",
        "cash and short term investments",
        "cashandshortterminvestments",
        "cashAndCashEquivalentsAtCarryingValue",
        "cash",
    ),
    "current_liabilities": ("current liabilities", "currentliabilities", "total current liabilities", "totalcurrentliabilities", "totalCurrentLiabilities"),
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
        "common stock dividend paid",
        "commonstockdividendpaid",
        "cash dividends paid direct",
        "cashdividendspaiddirect",
        "dividends paid",
        "dividendspaid",
        "dividendPayout",
    ),
    "shares_outstanding": (
        "ordinary shares number",
        "ordinarysharesnumber",
        "share issued",
        "shareissued",
        "common stock shares outstanding",
        "commonstocksharesoutstanding",
        "commonStockSharesOutstanding",
        "shares outstanding",
        "sharesoutstanding",
    ),
    "eps": ("diluted eps", "dilutedeps", "basic eps", "basiceps", "reported eps", "reportedeps", "reportedEPS", "eps"),
    "dividend_per_share": ("dividend per share", "dividendpershare", "DividendPerShare"),
    "reference_price": ("reference price", "referenceprice", "close", "last close", "lastclose"),
    "dividend_yield": ("dividend yield", "dividendyield", "DividendYield"),
    "free_cash_flow": ("free cash flow", "freecashflow", "freeCashFlow"),
    "market_cap": ("market cap", "marketcap", "market capitalization", "marketcapitalization"),
    "enterprise_value": ("enterprise value", "enterprisevalue"),
    "pe": ("p/e", "pe", "pe ratio", "peratio", "trailingPE"),
    "pbv": ("p/bv", "pbv", "p/b", "pb", "price to book", "pricebook", "priceToBook"),
    "ps": ("p/s", "ps", "price to sales", "pricetosales", "priceToSalesTrailing12Months"),
    "ev_ebitda": ("ev/ebitda", "evebitda", "enterprise value to ebitda", "enterprisevaluetoebitda"),
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
    accumulate: bool = False,
) -> None:
    number = _number(value)
    if not period_key or not field or number is None:
        return
    if field in {"capex", "dividend_paid"}:
        number = abs(number)
    period_values = normalized["periods"].setdefault(period_key, {})
    if field in period_values:
        if accumulate and isinstance(period_values[field].get("value"), (int, float)):
            period_values[field]["value"] = float(period_values[field]["value"]) + number
            period_values[field]["source_field"] = f"{period_values[field].get('source_field')}; {source_field}"
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




def _dict_date_rows(mapping: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    rows: list[Mapping[str, Any]] = []
    for raw_date, raw_value in mapping.items():
        try:
            datetime.fromisoformat(str(raw_date)[:10])
        except (TypeError, ValueError):
            return []
        if isinstance(raw_value, Mapping):
            item = dict(raw_value)
            item.setdefault("date", raw_date)
            rows.append(item)
        else:
            rows.append({"date": raw_date, "dividend_per_share": raw_value})
    return rows


def _csv_event_rows(payload: str) -> list[Mapping[str, Any]]:
    lines = [line for line in payload.splitlines() if line.strip() and not line.lstrip().startswith("#")]
    if len(lines) < 2 or "," not in payload:
        return []
    try:
        reader = csv.DictReader(StringIO("\n".join(lines)))
    except csv.Error:
        return []
    rows: list[Mapping[str, Any]] = []
    for row in reader:
        if not row:
            continue
        item = dict(row)
        if "" in item and item[""] and not item.get("date"):
            item["date"] = item[""]
        rows.append(item)
    return rows


def _dividend_event_rows(payload: Any) -> list[Mapping[str, Any]]:
    if hasattr(payload, "to_csv"):
        payload = payload.to_csv()
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, Mapping)]
    if isinstance(payload, str):
        mapping = _load_mapping(payload)
        if isinstance(mapping, Mapping):
            payload = mapping
        else:
            return _csv_event_rows(payload)
    if not isinstance(payload, Mapping):
        return []
    for key in ("dividends", "Dividends", "corporate_actions", "corporateActions", "data", "rows"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, Mapping)]
        if isinstance(value, Mapping):
            return _dict_date_rows(value)
        if isinstance(value, str):
            return _csv_event_rows(value)
    return _dict_date_rows(payload)


def _event_period_keys(row: Mapping[str, Any]) -> list[str]:
    date_value = next(
        (
            row.get(key)
            for key in ("ex_date", "date", "Date", "payment_date", "record_date", "announcement_date", "")
            if row.get(key)
        ),
        None,
    )
    try:
        parsed = datetime.fromisoformat(str(date_value)[:10])
    except (TypeError, ValueError):
        return []
    annual = _fy_key(parsed.year)
    quarterly = f"{annual}Q{((parsed.month - 1) // 3) + 1}"
    return list(dict.fromkeys([annual, quarterly]))


def _event_amount(row: Mapping[str, Any]) -> float | None:
    for key in ("dividend_per_share", "Dividend Per Share", "Dividends", "cash_amount", "amount", "dividend", "cash_dividend"):
        amount = _number(row.get(key))
        if amount is not None:
            return abs(amount)
    return None


def _event_total(row: Mapping[str, Any]) -> float | None:
    for key in ("dividend_paid", "total", "total_amount", "dividend_total", "cash_total", "value"):
        total = _number(row.get(key))
        if total is not None:
            return abs(total)
    return None


def _parse_dividend_events(payload: Any, normalized: dict[str, Any], vendor: str) -> bool:
    rows = _dividend_event_rows(payload)
    if not rows:
        return False
    found = False
    for row in rows:
        period_keys = _event_period_keys(row)
        if not period_keys:
            continue
        amount = _event_amount(row)
        total = _event_total(row)
        for period_key in period_keys:
            if amount is not None:
                _merge_value(
                    normalized,
                    period_key,
                    "dividend_per_share",
                    amount,
                    source_vendor=vendor,
                    source_field="dividend_event.amount",
                    source_unit="raw",
                    accumulate=True,
                )
                found = True
            if total is not None:
                _merge_value(
                    normalized,
                    period_key,
                    "dividend_paid",
                    total,
                    source_vendor=vendor,
                    source_field="dividend_event.total",
                    source_unit="raw",
                    accumulate=True,
                )
                found = True
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
    if _parse_dividend_events(payload, normalized, vendor):
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


def _price_rows(price_data: Any) -> list[tuple[Any, Any]]:
    if hasattr(price_data, "to_csv"):
        price_data = price_data.to_csv()
    if isinstance(price_data, list):
        rows = [item for item in price_data if isinstance(item, Mapping)]
    elif isinstance(price_data, Mapping):
        nested = next(
            (price_data.get(key) for key in ("data", "rows", "prices", "points") if isinstance(price_data.get(key), list)),
            None,
        )
        if isinstance(nested, list):
            rows = [item for item in nested if isinstance(item, Mapping)]
        elif all(_number(value) is not None for value in price_data.values()):
            return list(price_data.items())
        else:
            rows = [price_data]
    elif isinstance(price_data, str) and "," in price_data:
        lines = [line for line in price_data.splitlines() if line.strip() and not line.lstrip().startswith("#")]
        if len(lines) < 2:
            return []
        try:
            rows = list(csv.DictReader(StringIO("\n".join(lines))))
        except csv.Error:
            return []
    else:
        return []

    parsed_rows: list[tuple[Any, Any]] = []
    for row in rows:
        if not isinstance(row, Mapping):
            continue
        field_map = {re.sub(r"[^a-z0-9]", "", str(field).lower()): field for field in row}
        date_field = next((field_map[key] for key in ("date", "datetime", "timestamp") if key in field_map), None)
        close_field = next(
            (field_map[key] for key in ("close", "adjclose", "lastclose", "price") if key in field_map),
            None,
        )
        if date_field and close_field:
            parsed_rows.append((row.get(date_field), row.get(close_field)))
    return parsed_rows


def _last_close_on_or_before(price_rows: list[tuple[Any, Any]], cutoff_value: Any) -> float | None:
    try:
        cutoff = datetime.fromisoformat(str(cutoff_value)[:10]).date()
    except (TypeError, ValueError):
        return None
    last_date = None
    last_close = None
    for raw_date, raw_close in price_rows:
        try:
            row_date = datetime.fromisoformat(str(raw_date)[:10]).date()
        except (TypeError, ValueError):
            continue
        close = _number(raw_close)
        if close is None or row_date > cutoff:
            continue
        if last_date is None or row_date >= last_date:
            last_date = row_date
            last_close = close
    return last_close


def reference_prices_by_period(
    periods: list[FinancialPeriod],
    price_data: Any,
    analysis_date: Any = None,
) -> dict[str, float]:
    rows = _price_rows(price_data)
    if not rows or not periods:
        return {}
    try:
        analysis_cutoff = datetime.fromisoformat(str(analysis_date)[:10]).date() if analysis_date else None
    except (TypeError, ValueError):
        analysis_cutoff = None
    prices: dict[str, float] = {}
    for period in periods:
        cutoff_value = period.sort_key or (f"{period.year}-12-31" if period.type == "annual" else None)
        try:
            period_cutoff = datetime.fromisoformat(str(cutoff_value)[:10]).date()
        except (TypeError, ValueError):
            continue
        if analysis_cutoff is not None and period_cutoff > analysis_cutoff:
            period_cutoff = analysis_cutoff
        close = _last_close_on_or_before(rows, period_cutoff.isoformat())
        if close is not None:
            prices[period.key] = close
    return prices


def _add_reference_prices(
    normalized: dict[str, Any],
    periods: list[FinancialPeriod],
    price_data: Any,
    analysis_date: Any,
) -> None:
    for period_key, reference_price in reference_prices_by_period(periods, price_data, analysis_date).items():
        _merge_value(
            normalized,
            period_key,
            "reference_price",
            reference_price,
            source_vendor="price_data",
            source_field="last_close_on_or_before_period_end",
        )


def _add_profile_fallbacks(
    normalized: dict[str, Any],
    periods: list[FinancialPeriod],
    company_profile: Mapping[str, Any] | None,
) -> None:
    if not isinstance(company_profile, Mapping):
        return
    shares_outstanding = company_profile.get("shares_outstanding") or company_profile.get("sharesOutstanding")
    for period in periods:
        _merge_value(
            normalized,
            period.key,
            "shares_outstanding",
            shares_outstanding,
            source_vendor="company_profile",
            source_field="shares_outstanding",
        )
    if periods:
        _merge_value(
            normalized,
            periods[-1].key,
            "market_cap",
            company_profile.get("market_cap") or company_profile.get("marketCap"),
            source_vendor="company_profile",
            source_field="market_cap",
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
    company_profile: Mapping[str, Any] | None = None,
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
    normalized["currency"] = "IDR" if str(ticker).upper().endswith(".JK") else (normalized["currency"] or "USD")

    for vendor in VENDOR_PRIORITY:
        for payload, frequency in grouped.get(vendor, []):
            _parse_statement(payload, normalized, vendor, frequency)

    _add_reference_prices(normalized, periods, price_data, analysis_date)
    _add_profile_fallbacks(normalized, periods, company_profile)
    return normalized
