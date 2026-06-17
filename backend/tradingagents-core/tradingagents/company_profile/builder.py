from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from typing import Any

from tradingagents.utils.normalization import number_or_int as _number

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
    "insider_percent",
    "institution_percent",
    "public_percent",
    "short_ratio",
    "enterprise_value",
    "trailing_pe",
    "forward_pe",
    "price_to_book",
    "price_to_sales",
    "enterprise_to_ebitda",
    "enterprise_to_revenue",
    "price_to_free_cash_flow",
    "enterprise_to_fcf",
    "earnings_yield",
    "fcf_yield",
    "dividend_yield",
    "payout_ratio",
    "peg_ratio",
    "beta",
    "float_shares",
    "current_ratio",
    "quick_ratio",
    "revenue_per_share",
    "return_on_equity",
    "return_on_assets",
    "total_cash_per_share",
    "current_price",
    "current_price_source",
    "current_price_as_of",
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

OPTIONAL_PROFILE_FIELDS = (
    "insider_percent",
    "institution_percent",
    "public_percent",
    "short_ratio",
    "enterprise_value",
    "trailing_pe",
    "forward_pe",
    "price_to_book",
    "price_to_sales",
    "enterprise_to_ebitda",
    "enterprise_to_revenue",
    "price_to_free_cash_flow",
    "enterprise_to_fcf",
    "earnings_yield",
    "fcf_yield",
    "dividend_yield",
    "payout_ratio",
    "peg_ratio",
    "beta",
    "float_shares",
    "current_ratio",
    "quick_ratio",
    "revenue_per_share",
    "return_on_equity",
    "return_on_assets",
    "total_cash_per_share",
    "current_price_source",
    "current_price_as_of",
)

OWNERSHIP_ENRICHMENT_FIELDS = (
    "shares_outstanding",
    "insider_percent",
    "institution_percent",
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
        "shares_out",
        "sharesOutstanding",
        "SharesOutstanding",
        "share_outstanding",
        "shareOutstanding",
    ),
    "insider_percent": (
        "insider_percent",
        "insider_pct",
        "heldPercentInsiders",
        "insiderOwnership",
        "insider_ownership",
    ),
    "institution_percent": (
        "institution_percent",
        "institution_pct",
        "heldPercentInstitutions",
        "institutionOwnership",
        "institution_ownership",
    ),
    "public_percent": ("public_percent", "public_pct", "publicOwnership", "public_ownership"),
    "short_ratio": ("short_ratio", "shortRatio"),
    "enterprise_value": ("enterprise_value", "enterpriseValue"),
    "trailing_pe": ("trailing_pe", "trailingPE"),
    "forward_pe": ("forward_pe", "forwardPE"),
    "price_to_book": ("price_to_book", "priceToBook"),
    "price_to_sales": ("price_to_sales", "priceToSalesTrailing12Months"),
    "enterprise_to_ebitda": ("enterprise_to_ebitda", "enterpriseToEbitda"),
    "enterprise_to_revenue": ("enterprise_to_revenue", "enterpriseToRevenue"),
    "price_to_free_cash_flow": ("price_to_free_cash_flow", "priceToFreeCashflow", "priceToFreeCashFlow"),
    "enterprise_to_fcf": ("enterprise_to_fcf", "enterpriseToFcf", "enterpriseToFreeCashFlow"),
    "earnings_yield": ("earnings_yield", "earningsYield"),
    "fcf_yield": ("fcf_yield", "free_cash_flow_yield", "freeCashFlowYield"),
    "dividend_yield": ("dividend_yield", "dividendYield"),
    "payout_ratio": ("payout_ratio", "payoutRatio"),
    "peg_ratio": ("peg_ratio", "pegRatio"),
    "beta": ("beta",),
    "float_shares": ("float_shares", "floatShares"),
    "current_ratio": ("current_ratio", "currentRatio"),
    "quick_ratio": ("quick_ratio", "quickRatio"),
    "revenue_per_share": ("revenue_per_share", "revenuePerShare"),
    "return_on_equity": ("return_on_equity", "returnOnEquity"),
    "return_on_assets": ("return_on_assets", "returnOnAssets"),
    "total_cash_per_share": ("total_cash_per_share", "totalCashPerShare"),
    "current_price": ("current_price", "currentPrice", "regularMarketPrice"),
    "current_price_source": ("current_price_source", "price_source"),
    "current_price_as_of": ("current_price_as_of", "price_timestamp"),
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



def _text(value: Any) -> str | None:
    if _blank(value):
        return None
    text = " ".join(str(value).split())
    return text or None


def _ownership_ratio(value: Any) -> float | None:
    number = _number(value)
    if number is None:
        return None
    number = float(number)
    if number > 1:
        number = number / 100
    return max(0, min(number, 1))


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
    for field in (
        "exchange",
        "currency",
        "country",
        "sector",
        "industry",
        "website",
        "current_price_source",
        "current_price_as_of",
        "fiscal_year_end",
    ):
        values[field] = _text(values[field])
    values["business_summary"] = _text(values["business_summary"])
    values["market_cap"] = _number(values["market_cap"])
    values["shares_outstanding"] = _number(values["shares_outstanding"])
    values["insider_percent"] = _number(values["insider_percent"])
    values["institution_percent"] = _number(values["institution_percent"])
    values["public_percent"] = _number(values["public_percent"])
    insider_ratio = _ownership_ratio(values["insider_percent"])
    institution_ratio = _ownership_ratio(values["institution_percent"])
    if (
        values["public_percent"] is None
        and insider_ratio is not None
        and institution_ratio is not None
    ):
        values["public_percent"] = max(0, 1 - insider_ratio - institution_ratio)
    for field in (
        "short_ratio",
        "enterprise_value",
        "trailing_pe",
        "forward_pe",
        "price_to_book",
        "price_to_sales",
        "enterprise_to_ebitda",
        "enterprise_to_revenue",
        "price_to_free_cash_flow",
        "enterprise_to_fcf",
        "earnings_yield",
        "fcf_yield",
        "dividend_yield",
        "payout_ratio",
        "peg_ratio",
        "beta",
        "float_shares",
        "current_ratio",
        "quick_ratio",
        "revenue_per_share",
        "return_on_equity",
        "return_on_assets",
        "total_cash_per_share",
    ):
        values[field] = _number(values[field])
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
    return any(_blank(profile.get(field)) for field in ENRICHMENT_FIELDS + OWNERSHIP_ENRICHMENT_FIELDS)


def _attach_ownership_aliases(profile: dict[str, Any]) -> None:
    shares_out = profile.get("shares_outstanding")
    insider_pct = profile.get("insider_percent")
    institution_pct = profile.get("institution_percent")
    public_pct = profile.get("public_percent")
    short_ratio = profile.get("short_ratio")

    profile["shares_out"] = shares_out
    profile["insider_pct"] = insider_pct
    profile["institution_pct"] = institution_pct
    profile["public_pct"] = public_pct
    profile["shares_ownership"] = {
        "shares_out": shares_out,
        "insider_pct": insider_pct,
        "institution_pct": institution_pct,
        "public_pct": public_pct,
        "short_ratio": short_ratio,
    }


def build_company_profile(
    *,
    ticker: str,
    fetch_vendor: Callable[[str], Any] | None = None,
    vendor_payloads: Mapping[str, Any] | None = None,
    vendor_order: list[str] | tuple[str, ...] | None = None,
) -> dict[str, Any]:
    """Build one canonical profile while limiting fallback vendor calls."""
    profile: dict[str, Any] = {field: None for field in PROFILE_FIELDS}
    profile["ticker"] = str(ticker or "").strip().upper() or None
    profile["officers"] = []
    sources_used: list[str] = []
    field_sources: dict[str, str] = {}
    warnings: list[str] = []

    ordered_vendors = list(vendor_order or ("yfinance", "finnhub", "alpha_vantage"))
    for vendor in ordered_vendors:
        if sources_used and not _needs_enrichment(profile):
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

    missing_fields = [
        field
        for field in PROFILE_FIELDS
        if field not in OPTIONAL_PROFILE_FIELDS and _blank(profile.get(field))
    ]
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
    _attach_ownership_aliases(profile)
    return profile
