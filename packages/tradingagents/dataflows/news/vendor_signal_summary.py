from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any


def _load(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, dict):
        return raw
    try:
        payload = json.loads(str(raw or ""))
    except (TypeError, ValueError):
        return None
    return payload if isinstance(payload, dict) else None


def fit_json_payload(raw: Any, limit: int) -> Any:
    """Trim the largest list (newest first) so an oversized JSON payload stays valid JSON."""
    if not isinstance(raw, str) or len(raw) <= limit:
        return raw
    payload = _load(raw)
    if payload is None:
        return raw
    lists = [value for value in payload.values() if isinstance(value, list) and value]
    if not lists:
        return raw
    rows = max(lists, key=lambda value: len(json.dumps(value, default=str)))
    if all(isinstance(row, dict) for row in rows):
        rows.sort(
            key=lambda row: str(
                row.get("transactionDate") or row.get("filingDate") or row.get("atTime") or ""
            ),
            reverse=True,
        )
    text = json.dumps(payload, default=str)
    while len(text) > limit and rows:
        rows[:] = rows[: int(len(rows) * limit / len(text) * 0.95)]
        text = json.dumps(payload, default=str)
    return text


def summarize_insider_transactions(
    raw: Any, *, as_of: str, lookback_days: int = 90
) -> dict[str, Any]:
    rows = (_load(raw) or {}).get("insider_transactions")
    if not isinstance(rows, list):
        return {
            "available": False,
            "reason": "No structured insider transactions (only Finnhub JSON is summarized).",
        }
    cutoff = date.fromisoformat(str(as_of)[:10]) - timedelta(days=lookback_days)
    buys = sells = 0
    net_shares = 0.0
    latest: str | None = None
    for row in rows:
        if not isinstance(row, dict):
            continue
        day = str(row.get("transactionDate") or row.get("filingDate") or "")[:10]
        try:
            if date.fromisoformat(day) < cutoff:
                continue
        except ValueError:
            continue
        code = str(row.get("transactionCode") or "").upper()
        if code not in {"P", "S"}:
            continue
        buys += code == "P"
        sells += code == "S"
        if isinstance(row.get("change"), (int, float)):
            net_shares += float(row["change"])
        latest = max(latest or day, day)
    return {
        "available": True,
        "source": "finnhub",
        "lookback_days": lookback_days,
        "open_market_buys": buys,
        "open_market_sells": sells,
        "net_shares_changed": net_shares,
        "latest_transaction_date": latest,
    }


def summarize_vendor_sentiment(news_raw: Any, social_raw: Any) -> dict[str, Any]:
    news = _load(news_raw) or {}
    social = _load(social_raw) or {}
    return {
        "news_sentiment": news.get("news_sentiment") if news.get("available") else None,
        "social_summary": social.get("summary") if social.get("available") else None,
        "source": "finnhub",
        "note": "Vendor aggregate scores; secondary to article evidence.",
    }
