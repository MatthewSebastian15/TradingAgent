from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from .finnhub_common import FinnhubUnavailableError, build_metadata, handle_finnhub_error, make_api_request


def _dump(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False, default=str)


def classify_earnings_risk(days_to_earnings: int | None) -> str:
    if days_to_earnings is None:
        return "unknown"
    if days_to_earnings <= 7:
        return "high"
    if days_to_earnings <= 30:
        return "medium"
    if days_to_earnings <= 60:
        return "low_medium"
    return "low"


def _days_between(start: str, end: str) -> int | None:
    try:
        return (datetime.strptime(end[:10], "%Y-%m-%d") - datetime.strptime(start[:10], "%Y-%m-%d")).days
    except (TypeError, ValueError):
        return None


def get_earnings_calendar(ticker: str, start_date: str, end_date: str) -> str:
    try:
        payload = make_api_request(
            "/calendar/earnings",
            {"symbol": ticker, "from": start_date, "to": end_date},
            feature_key="enable_events",
        )
        if not isinstance(payload, dict):
            raise FinnhubUnavailableError("Earnings calendar response is not an object.")
        rows = payload.get("earningsCalendar") if isinstance(payload.get("earningsCalendar"), list) else []
        rows = [row for row in rows if isinstance(row, dict)]
        next_date = None
        future_dates = sorted(str(row.get("date") or "") for row in rows if str(row.get("date") or "") >= start_date)
        if future_dates:
            next_date = future_dates[0]
        days = _days_between(start_date, next_date) if next_date else None
        risk_level = classify_earnings_risk(days)
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "event_risk": {
                    "next_earnings_date": next_date,
                    "days_to_earnings": days,
                    "risk_level": risk_level,
                    "reason": "Upcoming earnings proximity can increase gap risk."
                    if next_date
                    else "No upcoming earnings date returned in the requested window.",
                },
                "earnings_calendar": rows[:12],
                "metadata": build_metadata(
                    "/calendar/earnings", is_enrichment=True, confidence="medium" if rows else "low"
                ),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"earnings calendar for {ticker}", exc, fallback_next=None)


def get_stock_earnings(ticker: str) -> str:
    try:
        payload = make_api_request("/stock/earnings", {"symbol": ticker}, feature_key="enable_events")
        if not isinstance(payload, list):
            raise FinnhubUnavailableError("Historical earnings response is not a list.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "historical_earnings": payload[:12],
                "metadata": build_metadata("/stock/earnings", is_enrichment=True, confidence="medium"),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"historical earnings for {ticker}", exc, fallback_next=None)


def get_recommendation_trends(ticker: str) -> str:
    try:
        payload = make_api_request("/stock/recommendation", {"symbol": ticker}, feature_key="enable_events")
        if not isinstance(payload, list):
            raise FinnhubUnavailableError("Recommendation trends response is not a list.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "recommendation_trends": payload[:12],
                "usage_note": "Use as external comparison only; never as the final trading decision by itself.",
                "metadata": build_metadata(
                    "/stock/recommendation", is_enrichment=True, confidence="medium" if payload else "low"
                ),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"recommendation trends for {ticker}", exc, fallback_next=None)


def get_event_risk(ticker: str, start_date: str, end_date: str) -> str:
    earnings = get_earnings_calendar(ticker, start_date, end_date)
    recommendations = get_recommendation_trends(ticker)
    return "## Finnhub Event Risk Context\n\n" + earnings + "\n\n" + recommendations
