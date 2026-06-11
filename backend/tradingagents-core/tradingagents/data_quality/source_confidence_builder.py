from __future__ import annotations

from datetime import date, datetime
from typing import Any

from tradingagents.utils.normalization import as_dict as _as_dict, as_list as _as_list, number as _number

KNOWN_VENDORS = ("idx_official", "yfinance", "alpha_vantage", "finnhub", "google_news_light", "marketaux", "newsdata")
SUCCESS_STATUSES = {"success", "cache_hit", "ok", "complete"}
PARTIAL_STATUSES = {"partial", "fallback"}
RATE_LIMIT_STATUSES = {"rate_limited"}
UNAVAILABLE_STATUSES = {"unavailable", "failed", "error", "request_failed"}
SKIPPED_STATUSES = {"disabled", "skipped", "skipped_sufficient_primary", "unsupported", "budget_exceeded"}

IMPORTANT_FIELDS = {
    "current_price": "high",
    "ohlcv": "high",
    "ohlcv_history": "high",
    "revenue": "high",
    "net_profit": "high",
    "total_equity": "high",
    "total_debt": "high",
    "cash": "medium",
    "ebitda": "medium",
    "operating_cash_flow": "medium",
    "capex": "medium",
    "free_cash_flow": "medium",
    "market_cap": "medium",
    "shares_outstanding": "medium",
    "eps": "medium",
    "bvps": "low",
    "payout_ratio": "low",
    "unit_note": "medium",
    "sections": "medium",
}



def _impact(field: str) -> str:
    lowered = field.lower()
    for key, impact in IMPORTANT_FIELDS.items():
        if key in lowered:
            return impact
    return "medium"


def _missing_item(
    module: str, field: str, *, fallback_available: bool = False, impact: str | None = None
) -> dict[str, Any]:
    return {
        "module": module,
        "field": field,
        "impact": impact or _impact(field),
        "fallback_available": bool(fallback_available),
    }


def _dedupe_items(items: list[dict[str, Any]], keys: tuple[str, ...]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    deduped: list[dict[str, Any]] = []
    for item in items:
        key = tuple(item.get(part) for part in keys)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _quality_payloads(result: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    modules = [
        "company_profile",
        "financial_highlights",
        "financial_trends",
        "valuation_multiples",
        "fair_value_range",
        "scenario_analysis",
        "quality_of_earnings",
        "balance_sheet_risk",
        "dividend_quality",
        "price_chart",
        "technical_entry",
        "news_impact",
        "analyst_consensus",
    ]
    payloads = []
    for module in modules:
        payload = _as_dict(result.get(module))
        quality = _as_dict(payload.get("data_quality"))
        if quality:
            payloads.append((module, quality))
    root_quality = _as_dict(result.get("data_quality"))
    if root_quality:
        payloads.append(("pipeline", root_quality))
    return payloads


def _missing_from_quality(result: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for module, quality in _quality_payloads(result):
        for field in _as_list(quality.get("missing_fields")):
            items.append(_missing_item(module, str(field)))
        for field in _as_list(quality.get("missing_metrics")):
            items.append(_missing_item(module, str(field)))
        for period in _as_list(quality.get("missing_periods")):
            items.append(_missing_item(module, f"period {period}", impact="medium"))

    profile = _as_dict(result.get("company_profile"))
    for field in ("company_name", "sector", "industry", "currency"):
        if not profile.get(field):
            items.append(_missing_item("company_profile", field, impact="medium"))

    highlights = _as_dict(result.get("financial_highlights"))
    rows = _as_list(highlights.get("rows"))
    row_by_key = {str(row.get("key")): row for row in rows if isinstance(row, dict)}
    for required, impact in (("ebitda", "medium"), ("payout_ratio", "low")):
        row = row_by_key.get(required)
        values = _as_dict(row.get("values")) if row else {}
        if not row or all(_as_dict(cell).get("status") == "unavailable" for cell in values.values()):
            items.append(_missing_item("financial_highlights", required, impact=impact))
    if rows and not _as_list(highlights.get("sections")):
        items.append(_missing_item("financial_highlights", "sections", impact="medium"))
    if highlights and not highlights.get("unit_note"):
        items.append(_missing_item("financial_highlights", "unit_note", impact="medium"))
    for item in _as_list(highlights.get("point_in_time")):
        if isinstance(item, dict) and item.get("key") == "market_cap" and not item.get("as_of"):
            items.append(_missing_item("financial_highlights", "market_cap.as_of", impact="medium"))

    chart = _as_dict(result.get("price_chart"))
    if chart and not (_as_list(chart.get("data")) or _as_list(chart.get("points"))):
        items.append(_missing_item("price_chart", "OHLCV", impact="high"))

    news = _as_dict(result.get("news_impact"))
    if news and not _as_list(news.get("full_news_list")) and not _as_list(news.get("high_impact_news")):
        items.append(_missing_item("news_impact", "news", impact="medium"))

    return _dedupe_items(items, ("module", "field"))


def _fallback_from_quality(result: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for module, quality in _quality_payloads(result):
        for note in _as_list(quality.get("fallback_used")):
            items.append({"field": module, "method": str(note), "confidence": "medium"})

    highlights = _as_dict(result.get("financial_highlights"))
    for row in _as_list(highlights.get("rows")):
        if not isinstance(row, dict):
            continue
        for cell in _as_dict(row.get("values")).values():
            payload = _as_dict(cell)
            if payload.get("status") == "estimated":
                items.append(
                    {
                        "field": str(row.get("key") or row.get("label") or "financial_metric"),
                        "method": str(payload.get("formula") or payload.get("source_field") or "estimated"),
                        "confidence": "medium",
                    }
                )
    for item in _as_list(highlights.get("point_in_time")):
        payload = _as_dict(item)
        if payload.get("status") in {"estimated", "calculated"} and payload.get("key") == "market_cap":
            items.append(
                {
                    "field": "market_cap",
                    "method": "price_times_shares_outstanding"
                    if payload.get("status") == "calculated"
                    else "company_profile_fallback",
                    "confidence": "high" if payload.get("status") == "calculated" else "medium",
                }
            )

    for route, attempts in _as_dict(result.get("vendor_attempts")).items():
        for attempt in _as_list(attempts):
            vendor, status, _detail = _parse_attempt(str(attempt))
            if status == "fallback":
                items.append({"field": str(route), "method": f"{vendor}_fallback", "confidence": "medium"})

    return _dedupe_items(items, ("field", "method"))


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _stale_warnings(result: dict[str, Any]) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    field_quality = _as_dict(_as_dict(result.get("data_quality")).get("field_quality"))
    for field_name, quality_value in field_quality.items():
        quality = _as_dict(quality_value)
        freshness = quality.get("freshness_status") or quality.get("freshness")
        freshness_payload = _as_dict(freshness)
        status = str(
            freshness_payload.get("status")
            or freshness
            or quality.get("status")
            or "unknown"
        ).lower()
        is_stale = bool(freshness_payload.get("is_stale")) or status in {"stale", "unknown", "outdated"}
        if not is_stale:
            continue
        warnings.append(
            {
                "module": "field_quality",
                "field": str(field_name),
                "warning": "; ".join(str(item) for item in (quality.get("warnings") or freshness_payload.get("warnings") or []))
                or "Field freshness cannot be verified.",
                "severity": "medium" if status == "stale" else "low",
            }
        )

    trade_date = _parse_date(result.get("trade_date"))
    price_date = _parse_date(result.get("current_price_as_of") or result.get("last_close_price_as_of"))
    if not price_date:
        warnings.append(
            {
                "module": "price_chart",
                "field": "current_price_as_of",
                "warning": "Price freshness cannot be verified.",
                "severity": "medium",
            }
        )
    elif trade_date and (trade_date - price_date).days > 7:
        warnings.append(
            {
                "module": "price_chart",
                "field": "current_price_as_of",
                "warning": "Latest price date is older than the requested analysis date.",
                "severity": "medium",
            }
        )

    highlights = _as_dict(result.get("financial_highlights"))
    if highlights and not _as_list(highlights.get("periods")):
        warnings.append(
            {
                "module": "financial_highlights",
                "field": "periods",
                "warning": "Financial statement period is unclear.",
                "severity": "medium",
            }
        )
    for item in _as_list(highlights.get("point_in_time")):
        payload = _as_dict(item)
        if payload.get("key") == "market_cap" and not payload.get("as_of"):
            warnings.append(
                {
                    "module": "financial_highlights",
                    "field": "market_cap.as_of",
                    "warning": "Market cap snapshot date is missing.",
                    "severity": "medium",
                }
            )

    news = _as_dict(result.get("news_impact"))
    dated_news = [
        _parse_date(item.get("published_at")) for item in _as_list(news.get("full_news_list")) if isinstance(item, dict)
    ]
    dated_news = [item for item in dated_news if item is not None]
    if news and not dated_news and _number(news.get("news_count")):
        warnings.append(
            {
                "module": "news_impact",
                "field": "published_at",
                "warning": "News freshness cannot be verified.",
                "severity": "low",
            }
        )
    elif trade_date and dated_news and (trade_date - max(dated_news)).days > 45:
        warnings.append(
            {
                "module": "news_impact",
                "field": "published_at",
                "warning": "Latest news is older than the expected news window.",
                "severity": "low",
            }
        )
    return _dedupe_items(warnings, ("module", "field", "warning"))


def _parse_attempt(entry: Any) -> tuple[str, str, str | None]:
    if isinstance(entry, dict):
        return (
            str(entry.get("vendor") or "").strip().lower(),
            str(entry.get("status") or "").strip().lower(),
            str(entry.get("reason") or entry.get("detail") or "") or None,
        )
    vendor, _, rest = str(entry).partition(":")
    status = rest
    detail = None
    if "(" in rest and rest.endswith(")"):
        status, _, detail = rest[:-1].partition("(")
    return vendor.strip().lower(), status.strip().lower(), detail


def _normalize_vendor_status(statuses: list[str]) -> str:
    lowered = [status.lower() for status in statuses if status]
    if any(status in SUCCESS_STATUSES for status in lowered):
        return "success"
    if any(status in PARTIAL_STATUSES for status in lowered):
        return "partial"
    if any(status in RATE_LIMIT_STATUSES for status in lowered):
        return "rate_limited"
    if any(status in UNAVAILABLE_STATUSES for status in lowered):
        return "unavailable"
    if any(status in SKIPPED_STATUSES for status in lowered):
        return "skipped"
    return "skipped"


def _used_for_from_attempts(result: dict[str, Any]) -> dict[str, set[str]]:
    used_for: dict[str, set[str]] = {vendor: set() for vendor in KNOWN_VENDORS}
    for route, attempts in _as_dict(result.get("vendor_attempts")).items():
        for attempt in _as_list(attempts):
            vendor, status, _detail = _parse_attempt(str(attempt))
            if vendor in used_for and status in SUCCESS_STATUSES | PARTIAL_STATUSES:
                used_for[vendor].add(str(route))
    news = _as_dict(result.get("news") or result.get("news_context"))
    for vendor in _as_list(news.get("providers_used")):
        vendor_key = str(vendor).lower()
        if vendor_key in used_for:
            used_for[vendor_key].add("news")
    return used_for


def _vendor_status(result: dict[str, Any], missing_fields: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    statuses: dict[str, list[str]] = {vendor: [] for vendor in KNOWN_VENDORS}
    details: dict[str, list[str]] = {vendor: [] for vendor in KNOWN_VENDORS}
    for attempts in _as_dict(result.get("vendor_attempts")).values():
        for attempt in _as_list(attempts):
            vendor, status, detail = _parse_attempt(str(attempt))
            if vendor in statuses:
                statuses[vendor].append(status)
                if detail:
                    details[vendor].append(detail)

    news = _as_dict(result.get("news") or result.get("news_context"))
    for vendor, status in _as_dict(news.get("provider_status")).items():
        vendor_key = str(vendor).lower()
        if vendor_key in statuses:
            statuses[vendor_key].append(str(status).lower())

    used_for = _used_for_from_attempts(result)
    module_missing = {
        "idx_official": ["financial_highlights", "financial_trends", "company_profile"],
        "yfinance": ["price_chart", "company_profile", "financial_highlights"],
        "alpha_vantage": ["financial_highlights", "financial_trends"],
        "finnhub": ["company_profile", "analyst_consensus", "news_impact"],
        "google_news_light": ["news_impact"],
        "marketaux": ["news_impact"],
        "newsdata": ["news_impact"],
    }
    response: dict[str, dict[str, Any]] = {}
    for vendor in KNOWN_VENDORS:
        vendor_missing = [item["field"] for item in missing_fields if item.get("module") in module_missing[vendor]]
        response[vendor] = {
            "status": _normalize_vendor_status(statuses[vendor]),
            "used_for": sorted(used_for[vendor]),
            "missing_fields": sorted(set(vendor_missing)),
        }
        if details[vendor]:
            response[vendor]["error_category"] = details[vendor][0][:120]
    return response


def _component_score_from_status(status: Any, good_values: set[str]) -> int:
    text = str(status or "").lower()
    if text in good_values:
        return 95
    if text in {"partial", "market_closed", "fallback", "mock", "mock_validated"}:
        return 70
    if text in {"unavailable", "missing", "invalid", "invalid_ticker"}:
        return 20
    return 60 if text else 40


def _score_breakdown(
    result: dict[str, Any],
    *,
    missing_fields: list[dict[str, Any]],
    fallback_used: list[dict[str, Any]],
    stale_data_warning: list[dict[str, Any]],
    vendor_status: dict[str, dict[str, Any]],
) -> dict[str, int]:
    root_quality = _as_dict(result.get("data_quality"))
    price_data = _component_score_from_status(root_quality.get("price_data"), {"ok", "complete"})
    financial_data = _component_score_from_status(root_quality.get("fundamentals"), {"ok", "complete"})
    valuation_quality = _as_dict(_as_dict(result.get("fair_value_range")).get("data_quality"))
    valuation_data = _component_score_from_status(valuation_quality.get("status"), {"complete"})
    news_data = _component_score_from_status(root_quality.get("news"), {"ok", "complete"})

    successful_vendors = sum(
        1 for item in vendor_status.values() if item.get("status") in {"success", "partial", "fallback"}
    )
    vendor_success = round(successful_vendors / len(KNOWN_VENDORS) * 100) if KNOWN_VENDORS else 0

    freshness = max(0, 100 - (len(stale_data_warning) * 15))
    high_missing = sum(1 for item in missing_fields if item.get("impact") == "high")
    medium_missing = sum(1 for item in missing_fields if item.get("impact") == "medium")
    low_missing = sum(1 for item in missing_fields if item.get("impact") == "low")
    financial_data = max(0, financial_data - (high_missing * 12) - (medium_missing * 5) - (low_missing * 2))
    valuation_data = max(0, valuation_data - (len(fallback_used) * 4))
    return {
        "price_data": int(max(0, min(100, price_data))),
        "financial_data": int(max(0, min(100, financial_data))),
        "valuation_data": int(max(0, min(100, valuation_data))),
        "news_data": int(max(0, min(100, news_data))),
        "vendor_success": int(max(0, min(100, vendor_success))),
        "freshness": int(max(0, min(100, freshness))),
    }


def _confidence_label(score: int) -> str:
    if score >= 80:
        return "high"
    if score >= 60:
        return "medium"
    if score >= 40:
        return "low"
    return "very_low"


def _summary(score: int, missing_fields: list[dict[str, Any]], fallback_used: list[dict[str, Any]]) -> str:
    if score >= 80:
        return "Most critical financial, price, and news data were available."
    if score >= 60:
        return "Core data is usable, with some missing fields or fallback calculations."
    if score >= 40:
        return "Important data gaps reduce confidence in the analysis."
    return "Data quality is weak because critical fields or vendors are unavailable."


def _calculation_notes() -> list[str]:
    return [
        "Revenue Growth = (current revenue - previous revenue) / previous revenue",
        "EBITDA Margin = EBITDA / revenue",
        "Net Profit Margin = net profit / revenue",
        "ROE = net income / total equity",
        "EPS = net income / shares outstanding",
        "BVPS = total equity / shares outstanding",
        "DER = total debt / total equity",
        "FCF = operating cash flow - capital expenditure",
        "Enterprise Value = market cap + total debt - cash",
        "P/E = market cap / net income",
        "P/BV = market cap / total equity",
        "EV/EBITDA = enterprise value / EBITDA",
        "Risk/reward ratio = expected upside / expected downside",
        "Max Drawdown = largest peak-to-trough decline",
    ]


def build_source_confidence(result: dict[str, Any]) -> dict[str, Any]:
    missing_fields = _missing_from_quality(result)
    fallback_used = _fallback_from_quality(result)
    stale_data_warning = _stale_warnings(result)
    vendor_status = _vendor_status(result, missing_fields)
    score_breakdown = _score_breakdown(
        result,
        missing_fields=missing_fields,
        fallback_used=fallback_used,
        stale_data_warning=stale_data_warning,
        vendor_status=vendor_status,
    )
    weighted_score = round(
        (score_breakdown["price_data"] * 0.20)
        + (score_breakdown["financial_data"] * 0.25)
        + (score_breakdown["valuation_data"] * 0.15)
        + (score_breakdown["news_data"] * 0.10)
        + (score_breakdown["vendor_success"] * 0.15)
        + (score_breakdown["freshness"] * 0.10)
        - min(20, len(fallback_used) * 2)
    )
    score = int(max(0, min(100, weighted_score)))
    return {
        "data_quality": {
            "score": score,
            "confidence": _confidence_label(score),
            "summary": _summary(score, missing_fields, fallback_used),
            "score_breakdown": score_breakdown,
        },
        "vendor_status": vendor_status,
        "missing_fields": missing_fields[:80],
        "fallback_used": fallback_used[:80],
        "stale_data_warning": stale_data_warning[:30],
        "calculation_notes": _calculation_notes(),
    }
