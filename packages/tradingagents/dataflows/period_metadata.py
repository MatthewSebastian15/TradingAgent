"""Standard period metadata schema for fundamental data."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any


@dataclass(frozen=True)
class PeriodMetadata:
    period_label: str
    period_type: str
    fiscal_year: int | None = None
    fiscal_quarter: int | None = None
    period_start: str | None = None
    period_end: str | None = None
    reported_date: str | None = None
    as_of_date: str | None = None
    is_restated: bool = False
    audit_status: str | None = None
    currency: str = "IDR"
    unit: str = "raw"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_DATE_PATTERN = re.compile(r"(19\d{2}|20\d{2}|21\d{2}|22\d{2})[-/](1[0-2]|0?[1-9])[-/](3[01]|[12]\d|0?[1-9])")
_YEAR_PATTERN = re.compile(r"(?:FY)?((?:19|20|21|22)\d{2}|\d{2})(?!\d)")
_QUARTER_PATTERNS = (
    re.compile(r"(?:FY)?((?:19|20|21|22)\d{2}|\d{2})\s*Q([1-4])", re.IGNORECASE),
    re.compile(r"Q([1-4])\s*(?:FY)?((?:19|20|21|22)\d{2}|\d{2})", re.IGNORECASE),
)


def _clean_currency(currency: str | None) -> str:
    return str(currency or "IDR").strip().upper()


def _clean_unit(unit: str | None) -> str:
    return str(unit or "raw").strip().lower()


def _year(value: int | str | None) -> int | None:
    text = str(value or "").strip()
    if not text:
        return None
    match = _YEAR_PATTERN.search(text)
    raw = match.group(1) if match else text[:4]
    try:
        year = int(raw)
    except (TypeError, ValueError):
        return None
    if 0 <= year <= 99:
        year += 2000 if year < 70 else 1900
    return year if 1900 <= year <= 2200 else None


def extract_date_or_none(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    match = _DATE_PATTERN.search(text)
    if not match:
        return None
    year, month, day = match.groups()
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except ValueError:
        return None


def extract_year_or_none(value: Any) -> int | None:
    return _year(value)


def extract_quarter_or_none(value: Any) -> int | None:
    text = str(value or "").strip()
    for pattern in _QUARTER_PATTERNS:
        match = pattern.search(text)
        if match:
            quarter = match.group(2) if pattern.pattern.startswith("(?:FY)") else match.group(1)
            return int(quarter)
    return None


def infer_quarter_from_date(value: Any) -> int | None:
    iso_date = extract_date_or_none(value)
    if not iso_date:
        return None
    month = int(iso_date[5:7])
    return ((month - 1) // 3) + 1


def _is_quarter_end(value: str | None) -> bool:
    return bool(value and value[5:10] in {"03-31", "06-30", "09-30"})


def build_annual_period_metadata(
    year: int | str,
    *,
    reported_date: str | None = None,
    as_of_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
    audit_status: str | None = "audited",
) -> dict[str, Any]:
    fiscal_year = _year(year)
    if fiscal_year is None:
        raise ValueError("annual period metadata requires a valid fiscal year")
    period_end = f"{fiscal_year}-12-31"
    return PeriodMetadata(
        period_label=f"FY{fiscal_year}",
        period_type="annual",
        fiscal_year=fiscal_year,
        fiscal_quarter=None,
        period_start=f"{fiscal_year}-01-01",
        period_end=period_end,
        reported_date=reported_date,
        as_of_date=as_of_date or reported_date or period_end,
        is_restated=bool(is_restated),
        audit_status=audit_status,
        currency=_clean_currency(currency),
        unit=_clean_unit(unit),
    ).to_dict()


def build_quarter_period_metadata(
    year: int | str,
    quarter: int | str,
    *,
    reported_date: str | None = None,
    as_of_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
    audit_status: str | None = None,
) -> dict[str, Any]:
    fiscal_year = _year(year)
    try:
        fiscal_quarter = int(quarter)
    except (TypeError, ValueError):
        fiscal_quarter = 0
    if fiscal_year is None or fiscal_quarter not in {1, 2, 3, 4}:
        raise ValueError("quarter period metadata requires a valid fiscal year and quarter 1-4")
    quarter_ranges = {
        1: ("01-01", "03-31"),
        2: ("04-01", "06-30"),
        3: ("07-01", "09-30"),
        4: ("10-01", "12-31"),
    }
    start_suffix, end_suffix = quarter_ranges[fiscal_quarter]
    period_end = f"{fiscal_year}-{end_suffix}"
    return PeriodMetadata(
        period_label=f"Q{fiscal_quarter} {fiscal_year}",
        period_type="quarterly",
        fiscal_year=fiscal_year,
        fiscal_quarter=fiscal_quarter,
        period_start=f"{fiscal_year}-{start_suffix}",
        period_end=period_end,
        reported_date=reported_date,
        as_of_date=as_of_date or reported_date or period_end,
        is_restated=bool(is_restated),
        audit_status=audit_status,
        currency=_clean_currency(currency),
        unit=_clean_unit(unit),
    ).to_dict()


def build_ttm_period_metadata(
    end_date: str,
    *,
    reported_date: str | None = None,
    as_of_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
    audit_status: str | None = None,
) -> dict[str, Any]:
    parsed = date.fromisoformat(str(end_date)[:10])
    return PeriodMetadata(
        period_label=f"TTM {parsed.isoformat()}",
        period_type="ttm",
        fiscal_year=parsed.year,
        fiscal_quarter=None,
        period_start=None,
        period_end=parsed.isoformat(),
        reported_date=reported_date,
        as_of_date=as_of_date or reported_date or parsed.isoformat(),
        is_restated=bool(is_restated),
        audit_status=audit_status,
        currency=_clean_currency(currency),
        unit=_clean_unit(unit),
    ).to_dict()


def merge_period_metadata(existing: dict[str, Any] | None, incoming: dict[str, Any] | None) -> dict[str, Any]:
    merged = dict(existing or {})
    for key, value in (incoming or {}).items():
        if value is not None and value != "":
            merged[key] = value
    if merged.get("reported_date") and not merged.get("as_of_date"):
        merged["as_of_date"] = merged["reported_date"]
    if merged.get("period_end") and not merged.get("as_of_date"):
        merged["as_of_date"] = merged["period_end"]
    merged.setdefault("currency", _clean_currency(merged.get("currency")))
    merged.setdefault("unit", _clean_unit(merged.get("unit")))
    merged.setdefault("is_restated", False)
    return merged


def infer_period_metadata(
    value: str | None,
    *,
    period_type_hint: str | None = None,
    period_end: str | None = None,
    reported_date: str | None = None,
    as_of_date: str | None = None,
    currency: str = "IDR",
    unit: str = "raw",
    is_restated: bool = False,
    audit_status: str | None = None,
) -> dict[str, Any]:
    text = str(value or "").strip()
    hint = str(period_type_hint or "").strip().lower()
    normalized_hint = "quarterly" if hint in {"quarter", "q"} else hint
    end_date = extract_date_or_none(period_end) or extract_date_or_none(text)

    if "TTM" in text.upper() or normalized_hint == "ttm":
        ttm_end = end_date or extract_date_or_none(reported_date)
        if ttm_end:
            return build_ttm_period_metadata(
                ttm_end,
                reported_date=reported_date,
                as_of_date=as_of_date,
                currency=currency,
                unit=unit,
                is_restated=is_restated,
                audit_status=audit_status,
            )

    quarter = extract_quarter_or_none(text)
    year = extract_year_or_none(text) or extract_year_or_none(period_end)

    if quarter and year:
        return build_quarter_period_metadata(
            year,
            quarter,
            reported_date=reported_date,
            as_of_date=as_of_date,
            currency=currency,
            unit=unit,
            is_restated=is_restated,
            audit_status=audit_status,
        )

    if end_date:
        parsed = date.fromisoformat(end_date)
        if normalized_hint == "quarterly" or (normalized_hint != "annual" and _is_quarter_end(end_date)):
            return build_quarter_period_metadata(
                parsed.year,
                infer_quarter_from_date(end_date) or 4,
                reported_date=reported_date,
                as_of_date=as_of_date,
                currency=currency,
                unit=unit,
                is_restated=is_restated,
                audit_status=audit_status,
            )
        return build_annual_period_metadata(
            parsed.year,
            reported_date=reported_date,
            as_of_date=as_of_date,
            currency=currency,
            unit=unit,
            is_restated=is_restated,
            audit_status=audit_status or "audited",
        )

    if normalized_hint == "annual" and year:
        return build_annual_period_metadata(
            year,
            reported_date=reported_date,
            as_of_date=as_of_date,
            currency=currency,
            unit=unit,
            is_restated=is_restated,
            audit_status=audit_status or "audited",
        )

    if normalized_hint == "quarterly" and year:
        inferred_quarter = quarter or infer_quarter_from_date(text)
        if inferred_quarter:
            return build_quarter_period_metadata(
                year,
                inferred_quarter,
                reported_date=reported_date,
                as_of_date=as_of_date,
                currency=currency,
                unit=unit,
                is_restated=is_restated,
                audit_status=audit_status,
            )

    if year:
        return build_annual_period_metadata(
            year,
            reported_date=reported_date,
            as_of_date=as_of_date,
            currency=currency,
            unit=unit,
            is_restated=is_restated,
            audit_status=audit_status or "audited",
        )

    return PeriodMetadata(
        period_label=text or "Unknown period",
        period_type=normalized_hint or "unknown",
        reported_date=reported_date,
        as_of_date=as_of_date or reported_date,
        is_restated=bool(is_restated),
        audit_status=audit_status,
        currency=_clean_currency(currency),
        unit=_clean_unit(unit),
    ).to_dict()


def attach_period_metadata_to_rows(
    rows: list[dict[str, Any]] | None,
    default_period_type: str = "annual",
    default_currency: str = "IDR",
    default_unit: str = "raw",
) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        item = dict(row)
        existing_period = item.get("period")
        currency = item.get("currency") or default_currency
        unit = item.get("unit") or default_unit

        if isinstance(existing_period, dict) and existing_period.get("period_label"):
            period = merge_period_metadata(
                {
                    "currency": currency,
                    "unit": unit,
                    "is_restated": False,
                },
                existing_period,
            )
            period["currency"] = _clean_currency(period.get("currency") or currency)
            period["unit"] = _clean_unit(period.get("unit") or unit)
            item["period"] = period
        else:
            label = item.get("period_label") or item.get("date") or item.get("fiscalDateEnding") or item.get("period")
            item["period"] = infer_period_metadata(
                str(label or ""),
                period_type_hint=item.get("period_type") or default_period_type,
                period_end=item.get("period_end") or item.get("fiscalDateEnding"),
                reported_date=item.get("reported_date") or item.get("reportedDate") or item.get("acceptedDate"),
                as_of_date=item.get("as_of_date") or item.get("asOfDate"),
                currency=currency,
                unit=unit,
                is_restated=bool(item.get("is_restated") or item.get("restated")),
                audit_status=item.get("audit_status"),
            )
        enriched.append(item)
    return enriched
