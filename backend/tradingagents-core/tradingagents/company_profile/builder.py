from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from typing import Any

PROFILE_FIELDS = (
    "company_name",
    "ticker",
    "exchange",
    "currency",
    "country",
    "sector",
    "industry",
    "business_summary",
    "website",
    "market_cap",
    "shares_outstanding",
    "current_price",
    "fiscal_year_end",
    "employee_count",
    "officers",
)

ENRICHMENT_FIELDS = (
    "company_name",
    "exchange",
    "currency",
    "country",
    "sector",
    "industry",
    "business_summary",
    "website",
    "market_cap",
    "shares_outstanding",
    "fiscal_year_end",
)

FIELD_ALIASES = {
    "company_name": ("company_name", "name", "Name", "longName", "shortName"),
    "ticker": ("ticker", "symbol", "Symbol"),
    "exchange": ("exchange", "Exchange", "fullExchangeName", "exchangeName"),
    "currency": ("currency", "Currency", "financialCurrency"),
    "country": ("country", "Country"),
    "sector": ("sector", "Sector"),
    "industry": ("industry", "Industry", "finnhubIndustry"),
    "business_summary": ("business_summary", "description", "Description", "longBusinessSummary"),
    "website": ("website", "OfficialSite", "weburl"),
    "market_cap": ("market_cap", "marketCap", "MarketCapitalization", "marketCapitalization"),
    "shares_outstanding": (
        "shares_outstanding",
        "sharesOutstanding",
        "SharesOutstanding",
        "share_outstanding",
        "shareOutstanding",
    ),
    "current_price": ("current_price", "currentPrice", "regularMarketPrice"),
    "fiscal_year_end": ("fiscal_year_end", "FiscalYearEnd"),
    "employee_count": ("employee_count", "full_time_employees", "fullTimeEmployees"),
    "officers": ("officers", "executives", "companyOfficers"),
}


def _blank(value: Any) -> bool:
    return value in (None, "", "None", "null", [], {})


def _load_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, Mapping) else {}
    return {}


def _number(value: Any) -> float | int | None:
    if isinstance(value, bool) or _blank(value):
        return None
    try:
        number = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    if number != number or number in {float("inf"), float("-inf")}:
        return None
    return int(number) if number.is_integer() else number


def _text(value: Any) -> str | None:
    if _blank(value):
        return None
    text = " ".join(str(value).split())
    return text or None


def _officers(value: Any) -> list[dict[str, str | None]]:
    if not isinstance(value, list):
        return []
    normalized = []
    for item in value[:10]:
        if not isinstance(item, Mapping):
            continue
        name = _text(item.get("name"))
        if not name:
            continue
        normalized.append({"name": name, "title": _text(item.get("title")) or "N/A"})
    return normalized


def _first(mapping: Mapping[str, Any], aliases: tuple[str, ...]) -> Any:
    for alias in aliases:
        if not _blank(mapping.get(alias)):
            return mapping.get(alias)
    return None


def _normalize_vendor_payload(payload: Any, vendor: str) -> dict[str, Any]:
    mapping = _load_mapping(payload)
    if not mapping or mapping.get("available") is False:
        return {}
    company = mapping.get("company") if isinstance(mapping.get("company"), Mapping) else mapping
    values = {field: _first(company, aliases) for field, aliases in FIELD_ALIASES.items()}

    values["company_name"] = _text(values["company_name"])
    values["ticker"] = _text(values["ticker"])
    for field in ("exchange", "currency", "country", "sector", "industry", "website", "fiscal_year_end"):
        values[field] = _text(values[field])
    values["business_summary"] = _text(values["business_summary"])
    values["market_cap"] = _number(values["market_cap"])
    values["shares_outstanding"] = _number(values["shares_outstanding"])
    values["current_price"] = _number(values["current_price"])
    values["employee_count"] = _number(values["employee_count"])
    values["officers"] = _officers(values["officers"])

    if vendor == "finnhub":
        if values["market_cap"] is not None:
            values["market_cap"] = values["market_cap"] * 1_000_000
        if values["shares_outstanding"] is not None:
            values["shares_outstanding"] = values["shares_outstanding"] * 1_000_000

    return values


def _needs_enrichment(profile: Mapping[str, Any]) -> bool:
    return any(_blank(profile.get(field)) for field in ENRICHMENT_FIELDS)


def build_company_profile(
    *,
    ticker: str,
    fetch_vendor: Callable[[str], Any] | None = None,
    vendor_payloads: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build one canonical profile while limiting fallback vendor calls."""
    profile: dict[str, Any] = {field: None for field in PROFILE_FIELDS}
    profile["ticker"] = str(ticker or "").strip().upper() or None
    profile["officers"] = []
    sources_used: list[str] = []
    field_sources: dict[str, str] = {}
    warnings: list[str] = []

    for vendor in ("yfinance", "finnhub", "alpha_vantage"):
        if vendor != "yfinance" and not _needs_enrichment(profile):
            break
        try:
            raw_payload = vendor_payloads.get(vendor) if vendor_payloads is not None else fetch_vendor(vendor)
        except Exception as exc:
            warnings.append(f"{vendor}: {exc}")
            continue
        normalized = _normalize_vendor_payload(raw_payload, vendor)
        added = False
        for field in PROFILE_FIELDS:
            if _blank(profile.get(field)) and not _blank(normalized.get(field)):
                profile[field] = normalized[field]
                field_sources[field] = vendor
                added = True
        if added:
            sources_used.append(vendor)

    missing_fields = [field for field in PROFILE_FIELDS if _blank(profile.get(field))]
    meaningful_fields = [field for field in PROFILE_FIELDS if field != "ticker" and not _blank(profile.get(field))]
    available = bool(meaningful_fields)
    status = "unavailable" if not available else "complete" if not missing_fields else "partial"
    profile["available"] = available
    profile["data_quality"] = {
        "status": status,
        "missing_fields": missing_fields,
        "sources_used": sources_used,
        "field_sources": field_sources,
    }
    if warnings:
        profile["data_quality"]["warnings"] = warnings
    if not available:
        profile["warning"] = "Company profile data is not available for this ticker."
    return profile
