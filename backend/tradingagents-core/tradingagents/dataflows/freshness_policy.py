"""Per-field freshness policy used by cache/status reporting."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

FIELD_TTL_SECONDS: dict[str, int] = {
    "quote": 300,
    "last_price": 300,
    "stock_price": 300,
    "historical_price": 86_400,
    "company_news": 3_600,
    "global_news": 10_800,
    "news_sentiment": 3_600,
    "social_sentiment": 3_600,
    "financial_statement": 86_400,
    "financial_metrics": 86_400,
    "fundamentals": 86_400,
    "balance_sheet": 86_400,
    "cashflow": 86_400,
    "income_statement": 86_400,
    "shareholders": 604_800,
    "executives": 2_592_000,
    "corporate_actions": 86_400,
    "insider_transactions": 43_200,
    "technical_indicators": 86_400,
}


def ttl_for_field(field_name: str, default_seconds: int = 900) -> int:
    return int(FIELD_TTL_SECONDS.get(str(field_name or "").lower(), default_seconds))


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value or "").strip()
    if not text:
        return None
    candidates = [text]
    if len(text) >= 10:
        candidates.append(text[:10])
    for candidate in candidates:
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
        try:
            return datetime.strptime(candidate[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def get_freshness_status(field_name: str, as_of: Any, now: datetime | None = None) -> dict[str, Any]:
    """Return freshness metadata for one field.

    Uses standardized statuses consumed by data-quality metadata: available,
    stale, or source_unavailable when timestamp is missing.
    """
    ttl = ttl_for_field(field_name)
    warnings: list[str] = []
    as_of_dt = _parse_datetime(as_of)
    if as_of_dt is None:
        return {
            "field_name": field_name,
            "status": "source_unavailable",
            "ttl_seconds": ttl,
            "age_seconds": None,
            "freshness_score": 0,
            "warnings": ["missing_as_of_date"],
        }
    now_dt = now.astimezone(timezone.utc) if now and now.tzinfo else (now or datetime.now(timezone.utc))
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)
    age_seconds = max(0, int((now_dt - as_of_dt).total_seconds()))
    status = "available" if age_seconds <= ttl else "stale"
    if status == "stale":
        warnings.append(f"{field_name} is stale: age_seconds={age_seconds}, ttl_seconds={ttl}")
    # 25 is the freshness component used by build_field_quality.
    freshness_score = 25 if status == "available" else max(0, int(25 * (ttl / age_seconds))) if age_seconds else 25
    return {
        "field_name": field_name,
        "status": status,
        "ttl_seconds": ttl,
        "age_seconds": age_seconds,
        "freshness_score": freshness_score,
        "warnings": warnings,
    }
