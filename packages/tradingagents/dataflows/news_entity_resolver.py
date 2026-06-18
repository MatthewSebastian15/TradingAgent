"""Resolve company aliases, subsidiaries, and negative terms in news text."""

from __future__ import annotations

import re
from typing import Any

ENTITY_ALIASES: dict[str, dict[str, list[str]]] = {
    "GOTO.JK": {
        "company": ["GOTO", "GoTo", "GoTo Gojek Tokopedia"],
        "subsidiaries": ["Gojek", "Tokopedia", "GoPay", "GoTo Financial"],
        "negative_terms": ["goto statement", "go to market"],
    },
    "BBCA.JK": {
        "company": ["BBCA", "BCA", "Bank Central Asia"],
        "subsidiaries": ["blu by BCA", "BCA Digital"],
        "negative_terms": [],
    },
    "BBRI.JK": {
        "company": ["BBRI", "BRI", "Bank Rakyat Indonesia"],
        "subsidiaries": ["BRI Finance", "BRImo"],
        "negative_terms": [],
    },
    "TLKM.JK": {
        "company": ["TLKM", "Telkom Indonesia", "Telkom"],
        "subsidiaries": ["Telkomsel", "IndiHome"],
        "negative_terms": [],
    },
}


def _contains(text: str, term: str) -> bool:
    term = str(term or "").strip().lower()
    if not term:
        return False
    return bool(
        re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text, flags=re.IGNORECASE)
    )


def resolve_news_entities(
    article: dict[str, Any], ticker: str, company_name: str | None = None
) -> dict[str, Any]:
    canonical = str(ticker or "").upper()
    aliases = ENTITY_ALIASES.get(
        canonical, {"company": [], "subsidiaries": [], "negative_terms": []}
    )
    text = (
        f"{article.get('title') or ''} {article.get('summary') or article.get('description') or ''}"
    ).lower()

    for negative in aliases.get("negative_terms", []):
        if _contains(text, negative):
            return {
                "entity_match": "negative",
                "matched_terms": [negative],
                "ticker": canonical,
                "confidence": 0,
            }

    matched_company = [term for term in aliases.get("company", []) if _contains(text, term)]
    short_ticker = canonical.removesuffix(".JK")
    if _contains(text, short_ticker) and short_ticker not in matched_company:
        matched_company.append(short_ticker)
    if company_name and _contains(text, company_name):
        matched_company.append(str(company_name))
    if matched_company:
        return {
            "entity_match": "company_exact",
            "matched_terms": list(dict.fromkeys(matched_company)),
            "ticker": canonical,
            "confidence": 92,
        }

    matched_subs = [term for term in aliases.get("subsidiaries", []) if _contains(text, term)]
    if matched_subs:
        return {
            "entity_match": "subsidiary",
            "matched_terms": list(dict.fromkeys(matched_subs)),
            "ticker": canonical,
            "confidence": 82,
        }

    return {"entity_match": "none", "matched_terms": [], "ticker": canonical, "confidence": 0}
