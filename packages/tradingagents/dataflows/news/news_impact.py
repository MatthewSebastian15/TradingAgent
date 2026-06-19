"""High-impact news rule engine."""

from __future__ import annotations

from typing import Any

HIGH_IMPACT_EVENTS = {
    "index_inclusion",
    "index_exclusion",
    "major_shareholder_change",
    "merger_acquisition",
    "merger",
    "acquisition",
    "fundraising",
    "earnings_release",
    "guidance_change",
    "regulatory_action",
    "major_lawsuit",
    "dividend_announcement",
    "stock_split",
    "rights_issue",
    "corporate_action",
    "earnings",
    "dividend",
    "regulatory",
}


def normalize_event_type(value: Any) -> str:
    return str(value or "general").strip().lower().replace(" ", "_").replace("-", "_")


def classify_news_impact(article: dict[str, Any]) -> dict[str, Any]:
    relevance = float(article.get("relevance_score") or 0)
    event = normalize_event_type(article.get("event_type") or article.get("materiality_category"))
    entity_match = str(article.get("entity_match") or "none")

    if entity_match == "company_exact" and event in HIGH_IMPACT_EVENTS and relevance >= 70:
        impact = "HIGH"
    elif entity_match in {"company_exact", "subsidiary", "sector"} and relevance >= 60:
        impact = "MEDIUM"
    elif event in HIGH_IMPACT_EVENTS and relevance >= 65:
        impact = "MEDIUM"
    else:
        impact = "LOW"

    return {
        **article,
        "impact_rule": impact,
        "impact_reason": f"entity={entity_match}, event={event}, relevance={relevance:.0f}",
    }
