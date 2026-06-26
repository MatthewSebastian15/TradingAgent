"""Financial-highlights table builder and dividend-event merging.

Extracted from normalizers.py to isolate the largest builder (and its
dividend helpers) from the core unit/period normalization machinery. Depends
on core helpers re-imported from `normalizers`; that module re-exports
`build_financial_highlights_from_normalized_rows` for backward compatibility.
"""

from __future__ import annotations

from typing import Any

from .normalizers import (
    FINANCIAL_FIELDS,
    _dataclass_to_dict,
    _field_record,
    _financial_period_from_metadata,
    _load_mapping,
    _number_like,
    _period_sort_key,
    unwrap_normalized_value,
)


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
