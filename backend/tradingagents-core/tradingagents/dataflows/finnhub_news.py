from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from .config import get_config
from .finnhub_common import FinnhubUnavailableError, handle_finnhub_error, make_api_request, unix_to_iso_datetime
from .news_aggregator import deduplicate_news as aggregate_deduplicate_news
from .news_aggregator import rank_news

EVENT_KEYWORDS = {
    "earnings": ["earnings", "revenue", "profit", "net income"],
    "dividend": ["dividend", "payout"],
    "merger_acquisition": ["merger", "acquisition", "takeover"],
    "legal": ["lawsuit", "court", "legal"],
    "regulation": ["regulation", "regulator", "policy"],
    "analyst_rating": ["rating", "upgrade", "downgrade", "target price"],
    "management_change": ["ceo", "cfo", "management"],
    "buyback": ["buyback", "repurchase"],
    "financing": ["debt", "bond", "loan"],
    "commodity": ["commodity", "oil", "coal", "nickel", "cpo"],
    "macro_policy": ["bi rate", "fed", "inflation", "rupiah"],
}


def _limit(default: int = 10) -> int:
    try:
        return max(1, int(get_config().get("max_news_per_vendor", default)))
    except (TypeError, ValueError):
        return default


def classify_event_type(title: str, summary: str = "") -> str:
    text = f"{title} {summary}".lower()
    for event_type, keywords in EVENT_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return event_type
    return "general"


def normalize_news_item(item: dict[str, Any], ticker: str | None = None) -> dict[str, Any]:
    title = str(item.get("headline") or item.get("title") or "No title").strip()
    summary = str(item.get("summary") or "").strip()
    publisher = str(item.get("source") or item.get("publisher") or "Unknown").strip()
    url = str(item.get("url") or "").strip()
    published_at = unix_to_iso_datetime(item.get("datetime")) or str(item.get("published_at") or "")
    related = item.get("related") or ticker
    event_type = classify_event_type(title, summary)
    return {
        "title": title,
        "summary": summary,
        "publisher": publisher,
        "url": url,
        "published_at": published_at,
        "related_ticker": related,
        "event_type": event_type,
        "relevance_score": 1.0 if ticker else 0.7,
        "sentiment": None,
        "source": "finnhub",
    }


def deduplicate_news(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return aggregate_deduplicate_news(items)


def _format_items(items: list[dict[str, Any]], label: str, start_date: str, end_date: str) -> str:
    if not items:
        return f"No news found for {label} between {start_date} and {end_date}"

    lines = [
        f"## Finnhub News for {label}, from {start_date} to {end_date}:",
        "",
        "Source metadata: finnhub:/company-news or finnhub:/news",
        "",
    ]
    for item in items:
        lines.append(f"### {item['title']} (source: {item['publisher']})")
        if item.get("published_at"):
            lines.append(f"Published: {item['published_at']}")
        lines.append(f"Event type: {item.get('event_type') or 'general'}")
        if item.get("summary"):
            lines.append(str(item["summary"]))
        if item.get("url"):
            lines.append(f"Link: {item['url']}")
        lines.append("")
    return "\n".join(lines).strip()


def get_news(ticker: str, start_date: str, end_date: str) -> str:
    try:
        payload = make_api_request(
            "/company-news",
            {"symbol": ticker, "from": start_date, "to": end_date},
            feature_key="enable_news",
        )
        if not isinstance(payload, list):
            raise FinnhubUnavailableError("Company news response is not a list.")
        items = [normalize_news_item(item, ticker=ticker) for item in payload if isinstance(item, dict)]
        items = rank_news(deduplicate_news(items), ticker=ticker)[: _limit(10)]
        return _format_items(items, ticker, start_date, end_date)
    except Exception as exc:
        return handle_finnhub_error(f"company news for {ticker}", exc, fallback_next="alpha_vantage")


def get_global_news(curr_date: str, look_back_days: int = 7, limit: int = 10, category: str = "general") -> str:
    try:
        curr_dt = datetime.strptime(curr_date, "%Y-%m-%d")
        start_date = (curr_dt - timedelta(days=int(look_back_days))).strftime("%Y-%m-%d")
        payload = make_api_request("/news", {"category": category}, feature_key="enable_news")
        if not isinstance(payload, list):
            raise FinnhubUnavailableError("Global news response is not a list.")
        items = [normalize_news_item(item, ticker=None) for item in payload if isinstance(item, dict)]
        items = rank_news(deduplicate_news(items), ticker=None)[: max(1, int(limit))]
        return _format_items(items, "global markets", start_date, curr_date)
    except Exception as exc:
        return handle_finnhub_error("global news", exc, fallback_next="alpha_vantage")
