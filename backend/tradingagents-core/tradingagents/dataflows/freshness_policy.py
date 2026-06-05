"""Per-field freshness policy used by cache/status reporting."""

from __future__ import annotations

FIELD_TTL_SECONDS: dict[str, int] = {
    "quote": 300,
    "last_price": 300,
    "historical_price": 86_400,
    "company_news": 3_600,
    "global_news": 10_800,
    "news_sentiment": 3_600,
    "social_sentiment": 3_600,
    "financial_statement": 86_400,
    "fundamentals": 86_400,
    "shareholders": 604_800,
    "executives": 2_592_000,
    "corporate_actions": 86_400,
}


def ttl_for_field(field_name: str, default_seconds: int = 900) -> int:
    return int(FIELD_TTL_SECONDS.get(str(field_name or "").lower(), default_seconds))
