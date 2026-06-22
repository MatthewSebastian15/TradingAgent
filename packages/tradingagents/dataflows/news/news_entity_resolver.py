"""Resolve company aliases, subsidiaries, and negative terms in news text."""

from __future__ import annotations

import re
from typing import Any

from .news_ticker_aliases import resolve_news_ticker


def _contains(text: str, term: str) -> bool:
    term = str(term or "").strip().lower()
    if not term:
        return False
    return bool(
        re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text, flags=re.IGNORECASE)
    )


def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        key = text.casefold()
        if not text or key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def resolve_news_entities(
    article: dict[str, Any], ticker: str, company_name: str | None = None
) -> dict[str, Any]:
    profile = resolve_news_ticker(ticker)
    canonical = str(profile.get("ticker") or ticker or "").upper()
    text = (
        f"{article.get('title') or ''} {article.get('summary') or article.get('description') or ''}"
    )

    for negative in profile.get("negative_terms", []):
        if _contains(text, negative):
            return {
                "entity_match": "negative",
                "matched_terms": [negative],
                "ticker": canonical,
                "confidence": 0,
            }

    company_terms = _dedupe(
        [
            str(profile.get("short_ticker") or ""),
            str(profile.get("ticker") or ""),
            str(profile.get("company_name") or ""),
            *(str(term) for term in profile.get("aliases", [])),
            str(company_name or ""),
        ]
    )
    matched_company = [term for term in company_terms if _contains(text, term)]
    if matched_company:
        return {
            "entity_match": "company_exact",
            "matched_terms": _dedupe(matched_company),
            "ticker": canonical,
            "confidence": 92,
        }

    matched_subs = [term for term in profile.get("subsidiaries", []) if _contains(text, term)]
    if matched_subs:
        return {
            "entity_match": "subsidiary",
            "matched_terms": _dedupe(matched_subs),
            "ticker": canonical,
            "confidence": 82,
        }

    return {"entity_match": "none", "matched_terms": [], "ticker": canonical, "confidence": 0}
