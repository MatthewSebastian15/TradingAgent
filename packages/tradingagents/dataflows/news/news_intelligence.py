from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from tradingagents.dataflows.news_aggregator import normalize_title, normalize_url, rank_news
from tradingagents.dataflows.news_dedup import dedup_news_articles_with_metadata
from tradingagents.dataflows.news_impact import classify_news_impact
from tradingagents.dataflows.news_noise_filter import route_news_bucket
from tradingagents.dataflows.news_relevance import score_news_relevance

MATERIAL_KEYWORDS = {
    "earnings": [
        "earnings",
        "profit",
        "revenue",
        "margin",
        "guidance",
        "eps",
        "laba",
        "pendapatan",
    ],
    "dividend": ["dividend", "payout", "distribution", "dividen"],
    "corporate_action": [
        "merger",
        "acquisition",
        "buyback",
        "rights issue",
        "spin off",
        "tender offer",
    ],
    "index": ["index inclusion", "index exclusion", "removes", "removed from", "free float"],
    "regulatory": ["investigation", "sanction", "regulation", "lawsuit", "probe", "fine"],
    "management": ["ceo", "cfo", "resignation", "appointment", "appoints", "chairman", "director"],
    "shareholder": ["shareholder", "pemegang saham", "ownership change", "kepemilikan saham"],
    "debt_rating": ["rating", "bond outlook", "peringkat obligasi"],
    "major_contract": ["major project", "partnership contract", "kontrak proyek"],
    "sector": ["interest rate", "commodity price", "policy", "inflation", "sector", "tariff"],
}

POSITIVE_WORDS = {
    "beat",
    "beats",
    "raise",
    "raises",
    "raised",
    "growth",
    "strong",
    "upgrade",
    "upgraded",
    "buyback",
    "dividend increase",
    "profit",
}
NEGATIVE_WORDS = {
    "miss",
    "misses",
    "cut",
    "cuts",
    "downgrade",
    "downgraded",
    "lawsuit",
    "probe",
    "sanction",
    "weak",
    "loss",
    "decline",
}


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in {float("inf"), float("-inf")} else None


def _safe_int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return (
            value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
        )
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        except (OSError, ValueError):
            return None
    text = str(value or "").strip()
    if not text:
        return None
    for candidate in (text, text[:10]):
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            return (
                parsed.astimezone(timezone.utc)
                if parsed.tzinfo
                else parsed.replace(tzinfo=timezone.utc)
            )
        except ValueError:
            pass
        try:
            return datetime.strptime(candidate[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def _clean_summary(value: Any, limit: int = 280) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _infer_sentiment_label(item: dict[str, Any]) -> str:
    label = str(item.get("sentiment") or item.get("sentiment_label") or "").lower().strip()
    if label in {"positive", "neutral", "negative"}:
        return label
    score = _safe_float(item.get("sentiment_score"))
    if score is not None:
        if score >= 0.15:
            return "positive"
        if score <= -0.15:
            return "negative"
    text = f"{item.get('title') or ''} {item.get('summary') or ''}".lower()
    if any(word in text for word in POSITIVE_WORDS):
        return "positive"
    if any(word in text for word in NEGATIVE_WORDS):
        return "negative"
    return "neutral"


def _sentiment_numeric(item: dict[str, Any], label: str) -> float:
    score = _safe_float(item.get("sentiment_score"))
    if score is not None:
        if -1 <= score <= 1:
            return score
        return max(-1.0, min(1.0, score / 100))
    if label == "positive":
        return 0.55
    if label == "negative":
        return -0.55
    return 0.0


def _source_confidence(source: Any) -> int:
    text = str(source or "").lower()
    if "finnhub" in text:
        return 85
    if "google news light" in text or "google_news_light" in text:
        return 80
    if "marketaux" in text:
        return 82
    if "newsdata" in text:
        return 74
    if "alpha" in text:
        return 72
    if "yfinance" in text or "yahoo" in text:
        return 68
    if text and text != "unknown":
        return 60
    return 45


def _source_confidence_label(score: int) -> str:
    if score >= 60:
        return "HIGH"
    if score >= 45:
        return "MEDIUM"
    return "LOW"


def _news_scope(item: dict[str, Any], relevance_category: str, entity_match: str) -> str:
    event_type = str(item.get("event_type") or "").strip().lower()
    if event_type == "market_context" or relevance_category in {"macro_related", "market_noise"}:
        return "market_context"
    if entity_match in {"company_exact", "subsidiary"} or relevance_category in {
        "company_specific",
        "subsidiary_related",
    }:
        return "company"
    if relevance_category == "sector_related":
        return "sector"
    return "market_context"


def _recency_score(published_at: Any, trade_date: str) -> int:
    published = _parse_datetime(published_at)
    trade = _parse_datetime(trade_date)
    if published is None or trade is None:
        return 35
    age_days = max(0, (trade.date() - published.date()).days)
    if age_days <= 1:
        return 100
    if age_days <= 3:
        return 85
    if age_days <= 7:
        return 70
    if age_days <= 14:
        return 55
    if age_days <= 30:
        return 40
    return 20


def _materiality_score(item: dict[str, Any]) -> tuple[int, str]:
    text = (
        f"{item.get('title') or ''} {item.get('summary') or ''} {item.get('event_type') or ''}"
    ).lower()
    for category, keywords in MATERIAL_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return 90, category
    if str(item.get("event_type") or "general").lower() != "general":
        return 65, str(item.get("event_type")).lower()
    return 25, "general"


def _article_key(item: dict[str, Any]) -> str:
    url = normalize_url(str(item.get("url") or ""))
    if url:
        return url
    return normalize_title(str(item.get("title") or ""))


def _collect_articles(
    related_news: dict[str, Any] | None, news_context: dict[str, Any] | None
) -> list[dict[str, Any]]:
    articles: list[dict[str, Any]] = []
    context_articles = []
    if isinstance(news_context, dict):
        context_articles = (
            news_context.get("decision_company_news")
            or news_context.get("prompt_articles")
            or news_context.get("articles")
            or []
        )
    for item in context_articles:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        if not title or not url:
            continue
        articles.append(
            {
                "title": title,
                "url": url,
                "source": item.get("provider") or item.get("source") or "vendor",
                "publisher": item.get("source") or item.get("publisher") or item.get("provider"),
                "published_at": item.get("published_at"),
                "summary": item.get("summary"),
                "sentiment_label": item.get("sentiment_label"),
                "sentiment_score": item.get("sentiment_score"),
                "relevance_score": item.get("relevance_score"),
                "event_type": item.get("event_type") or item.get("query_strategy") or "general",
                "related_ticker": item.get("ticker") or item.get("related_ticker"),
            }
        )
    related_items = (related_news or {}).get("items", []) if isinstance(related_news, dict) else []
    for item in related_items:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        if not title or not url:
            continue
        articles.append(dict(item))
    return articles


def build_news_impact(
    ticker: str,
    trade_date: str,
    related_news: dict[str, Any] | None = None,
    news_context: dict[str, Any] | None = None,
    *,
    limit: int | None = None,
) -> dict[str, Any]:
    raw_articles = _collect_articles(related_news, news_context)
    if not raw_articles:
        return {
            "available": False,
            "overall_sentiment": "neutral",
            "sentiment_score": 50,
            "high_impact_news": [],
            "full_news_list": [],
            "news_count": 0,
            "deduplicated_count": 0,
            "data_quality": {"status": "unavailable", "sources_used": []},
        }

    deduped, dedup_metadata = dedup_news_articles_with_metadata(raw_articles)
    ranked = rank_news(deduped, ticker=ticker)
    scored: list[dict[str, Any]] = []
    sentiment_values: list[float] = []
    for item in ranked:
        relevance_payload = score_news_relevance(
            item, ticker, str(item.get("company_name") or ""), str(item.get("sector") or "")
        )
        relevance = _safe_float(item.get("relevance_score"))
        calculated_relevance = _safe_float(relevance_payload.get("relevance_score")) or 0
        if relevance is None or relevance <= 0:
            text = f"{item.get('title') or ''} {item.get('summary') or ''}".upper()
            relevance = max(
                calculated_relevance, 70 if ticker.upper().removesuffix(".JK") in text else 45
            )
        else:
            relevance = max(relevance, calculated_relevance)
        relevance = max(0, min(100, relevance))
        relevance_category = str(relevance_payload.get("category") or "market_noise")
        if (
            str(item.get("event_type") or "").strip().lower() == "market_context"
            and relevance >= 55
            and relevance_category in {"irrelevant", "market_noise"}
        ):
            relevance_category = "macro_related"
        entity_match = str(relevance_payload.get("entity_match") or "none")
        sentiment = _infer_sentiment_label(item)
        sentiment_value = _sentiment_numeric(item, sentiment)
        sentiment_values.append(sentiment_value)
        sentiment_strength = abs(sentiment_value) * 100
        recency = _recency_score(item.get("published_at"), trade_date)
        materiality, category = _materiality_score(item)
        source = item.get("source") or item.get("publisher") or "unknown"
        source_confidence = _source_confidence(source)
        impact_score = round(
            (relevance * 0.35)
            + (recency * 0.25)
            + (sentiment_strength * 0.20)
            + (source_confidence * 0.10)
            + (materiality * 0.10),
            2,
        )
        base_impact = "high" if impact_score >= 70 else "medium" if impact_score >= 45 else "low"
        enriched = classify_news_impact(
            {
                "title": str(item.get("title") or "").strip(),
                "source": str(source or "unknown"),
                "published_at": str(item.get("published_at") or "")[:10] or None,
                "sentiment": sentiment,
                "impact": base_impact,
                "impact_score": impact_score,
                "relevance_score": round(relevance, 2),
                "relevance_category": relevance_category,
                "entity_match": entity_match,
                "matched_terms": relevance_payload.get("matched_terms") or [],
                "recency_score": recency,
                "materiality_score": materiality,
                "materiality_category": category,
                "event_type": item.get("event_type") or category,
                "source_confidence": source_confidence,
                "source_confidence_label": _source_confidence_label(source_confidence),
                "news_scope": _news_scope(item, relevance_category, entity_match),
                "dedupe_key": _article_key(item),
                "summary": _clean_summary(item.get("summary")),
                "url": str(item.get("url") or ""),
                "normalized_url": normalize_url(str(item.get("url") or "")),
            }
        )
        bucket = route_news_bucket(enriched)
        enriched["bucket"] = bucket
        strict_high = enriched.get("impact_rule") == "HIGH" or (
            base_impact == "high"
            and relevance_category in {"company_specific", "subsidiary_related", "sector_related"}
            and entity_match in {"company_exact", "subsidiary"}
        )
        enriched["impact"] = (
            "high" if strict_high else "medium" if base_impact == "high" else base_impact
        )
        enriched["is_high_impact"] = enriched["impact"] == "high"
        if bucket != "discard":
            scored.append(enriched)
    scored = sorted(
        scored, key=lambda item: (item["impact_score"], item["published_at"] or ""), reverse=True
    )
    average_sentiment = sum(sentiment_values) / len(sentiment_values) if sentiment_values else 0
    overall_sentiment = (
        "positive"
        if average_sentiment > 0.1
        else "negative"
        if average_sentiment < -0.1
        else "neutral"
    )
    sources_used = list(dict.fromkeys(str(item.get("source") or "unknown") for item in scored))
    high_impact_news = [item for item in scored if item["is_high_impact"]]
    full_news_all = [item for item in scored if not item["is_high_impact"]]
    full_limit = len(full_news_all) if limit is None else max(1, int(limit or 1))
    full_news_list = full_news_all[:full_limit]
    return {
        "available": True,
        "overall_sentiment": overall_sentiment,
        "sentiment_score": round(50 + (average_sentiment * 50)),
        "high_impact_news": high_impact_news,
        "full_news_list": full_news_list,
        "high_impact_count": len(high_impact_news),
        "full_news_count": len(full_news_all),
        "news_count": len(raw_articles),
        "deduplicated_count": len(scored),
        "dedup_removed_count": dedup_metadata.get("dedup_removed_count", 0),
        "data_quality": {
            "status": "complete",
            "sources_used": sources_used,
            "rules": {
                "high_impact_limited": False,
                "full_news_limited": len(full_news_all) > len(full_news_list),
            },
        },
    }


def _parse_json_payload(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    text = str(value or "").strip()
    if not text:
        return None
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def _catalyst_type(item: dict[str, Any]) -> str:
    category = str(item.get("materiality_category") or "").strip()
    if category and category != "general":
        return category
    text = f"{item.get('title') or ''} {item.get('summary') or ''}".lower()
    for candidate, keywords in MATERIAL_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return candidate
    return "sentiment"


def _label_for_catalyst(item: dict[str, Any], sentiment: str) -> str:
    catalyst_type = _catalyst_type(item).replace("_", " ")
    direction = "Positive" if sentiment == "positive" else "Negative"
    return f"{direction} {catalyst_type} catalyst"


def build_catalyst_tracker(
    news_impact: dict[str, Any] | None, event_risk: Any = None
) -> dict[str, Any]:
    if isinstance(news_impact, dict):
        news_items = []
        for key in ("high_impact_news", "full_news_list"):
            values = news_impact.get(key)
            if isinstance(values, list):
                news_items.extend(values)
    else:
        news_items = []
    positive: list[dict[str, Any]] = []
    negative: list[dict[str, Any]] = []
    for item in news_items:
        if not isinstance(item, dict) or item.get("impact") == "low":
            continue
        sentiment = str(item.get("sentiment") or "neutral")
        catalyst = {
            "type": _catalyst_type(item),
            "label": _label_for_catalyst(item, sentiment)
            if sentiment in {"positive", "negative"}
            else "Material news catalyst",
            "impact": item.get("impact") or "medium",
            "source": item.get("source") or "unknown",
            "date": item.get("published_at"),
            "related_news_title": item.get("title"),
        }
        if sentiment == "positive":
            positive.append(catalyst)
        elif sentiment == "negative":
            negative.append(catalyst)

    upcoming_events: list[dict[str, Any]] = []
    payload = _parse_json_payload(event_risk)
    if payload:
        event = payload.get("event_risk") if isinstance(payload.get("event_risk"), dict) else {}
        next_earnings = event.get("next_earnings_date") if isinstance(event, dict) else None
        if next_earnings:
            upcoming_events.append(
                {
                    "type": "earnings",
                    "label": "Upcoming quarterly earnings",
                    "date": next_earnings,
                    "source": "Finnhub",
                    "risk_level": event.get("risk_level"),
                }
            )
        rows = (
            payload.get("earnings_calendar")
            if isinstance(payload.get("earnings_calendar"), list)
            else []
        )
        for row in rows[:3]:
            if isinstance(row, dict) and row.get("date") and row.get("date") != next_earnings:
                upcoming_events.append(
                    {
                        "type": "earnings",
                        "label": "Upcoming earnings event",
                        "date": row.get("date"),
                        "source": "Finnhub",
                    }
                )

    if len(positive) > len(negative):
        bias = "positive"
        message = "Positive catalysts outweigh current negative catalysts."
    elif len(negative) > len(positive):
        bias = "negative"
        message = "Negative catalysts outweigh current positive catalysts."
    else:
        bias = "neutral"
        message = "Positive and negative catalysts are balanced or limited."

    return {
        "positive_catalysts": positive[:5],
        "negative_catalysts": negative[:5],
        "upcoming_events": upcoming_events[:5],
        "summary": {
            "overall_catalyst_bias": bias,
            "main_message": message,
        },
    }


def _recommendation_score(row: dict[str, Any]) -> float:
    total = sum(
        _safe_int(row.get(key)) for key in ("strong_buy", "buy", "hold", "sell", "strong_sell")
    )
    if total <= 0:
        return 0.0
    return (
        (_safe_int(row.get("strong_buy")) * 2)
        + _safe_int(row.get("buy"))
        - _safe_int(row.get("sell"))
        - (_safe_int(row.get("strong_sell")) * 2)
    ) / total


def _normalize_recommendation_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "period": row.get("period"),
        "strong_buy": _safe_int(row.get("strong_buy") or row.get("strongBuy")),
        "buy": _safe_int(row.get("buy")),
        "hold": _safe_int(row.get("hold")),
        "sell": _safe_int(row.get("sell")),
        "strong_sell": _safe_int(row.get("strong_sell") or row.get("strongSell")),
    }
    normalized["total"] = (
        normalized["strong_buy"]
        + normalized["buy"]
        + normalized["hold"]
        + normalized["sell"]
        + normalized["strong_sell"]
    )
    return normalized


def build_analyst_consensus(recommendation_trends: Any) -> dict[str, Any]:
    payload = _parse_json_payload(recommendation_trends)
    rows = payload.get("recommendation_trends") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        return {
            "available": False,
            "period": None,
            "strong_buy": 0,
            "buy": 0,
            "hold": 0,
            "sell": 0,
            "strong_sell": 0,
            "total": 0,
            "consensus_label": "N/A",
            "trend": "N/A",
            "data_quality": {"status": "unavailable", "source": "Finnhub"},
        }

    normalized_rows = [_normalize_recommendation_row(row) for row in rows if isinstance(row, dict)]
    normalized_rows = [row for row in normalized_rows if row["total"] > 0]
    if not normalized_rows:
        return {
            "available": False,
            "period": None,
            "strong_buy": 0,
            "buy": 0,
            "hold": 0,
            "sell": 0,
            "strong_sell": 0,
            "total": 0,
            "consensus_label": "N/A",
            "trend": "N/A",
            "data_quality": {"status": "unavailable", "source": "Finnhub"},
        }

    normalized_rows = sorted(
        normalized_rows, key=lambda row: str(row.get("period") or ""), reverse=True
    )
    latest = normalized_rows[0]
    buy_total = latest["strong_buy"] + latest["buy"]
    sell_total = latest["sell"] + latest["strong_sell"]
    if buy_total > latest["hold"] + sell_total:
        label = "positive"
    elif sell_total > buy_total:
        label = "negative"
    else:
        label = "neutral"

    if len(normalized_rows) >= 2:
        score_delta = _recommendation_score(latest) - _recommendation_score(normalized_rows[1])
        trend = (
            "improving"
            if score_delta > 0.15
            else "deteriorating"
            if score_delta < -0.15
            else "stable"
        )
    else:
        trend = "stable"

    return {
        "available": True,
        **latest,
        "consensus_label": label,
        "trend": trend,
        "data_quality": {"status": "complete", "source": "Finnhub"},
    }
