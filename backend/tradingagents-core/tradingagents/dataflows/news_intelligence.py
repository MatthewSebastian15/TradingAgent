from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from tradingagents.dataflows.news_aggregator import deduplicate_news, normalize_title, normalize_url, rank_news

MATERIAL_KEYWORDS = {
    "earnings": [
        "earnings", "profit", "net profit", "revenue", "sales", "margin", "eps",
        "laba", "laba bersih", "pendapatan", "penjualan", "rugi", "kinerja keuangan",
    ],
    "dividend": [
        "dividend", "dividen", "payout", "distribution", "cum date", "ex date",
        "pembagian dividen", "rasio pembayaran",
    ],
    "corporate_action": [
        "merger", "acquisition", "akuisisi", "buyback", "rights issue", "right issue",
        "private placement", "spin off", "tender offer", "reverse stock", "stock split",
        "aksi korporasi", "penggabungan", "peleburan",
    ],
    "index": [
        "msci", "ftse", "idx30", "lq45", "kompas100", "indeks", "index inclusion",
        "index exclusion", "rebalancing", "free float", "liquidity", "likuiditas",
        "keluar dari indeks", "masuk indeks", "dikeluarkan dari indeks",
    ],
    "regulatory": [
        "investigation", "sanction", "regulation", "lawsuit", "probe", "fine",
        "sanksi", "gugatan", "penyelidikan", "otoritas", "ojk", "bei", "idx",
        "suspensi", "suspension", "delisting", "peringatan tertulis",
    ],
    "management": [
        "ceo", "cfo", "director", "commissioner", "chairman", "resignation",
        "appointment", "direktur", "komisaris", "direktur utama", "pengunduran diri",
        "pergantian manajemen", "rapat umum pemegang saham", "rups",
    ],
    "shareholder": [
        "shareholder", "pemegang saham", "ownership", "kepemilikan", "pengendali",
        "beneficial owner", "ultimate shareholder", "public float", "free float",
    ],
    "debt_rating": [
        "bond", "bonds", "debt", "rating", "downgrade", "upgrade", "default",
        "utang", "obligasi", "sukuk", "peringkat", "gagal bayar", "refinancing",
    ],
    "major_contract": [
        "contract", "capex", "expansion", "project", "partnership", "joint venture",
        "kontrak", "proyek", "ekspansi", "belanja modal", "kerja sama", "kemitraan",
    ],
    "market_context": [
        "interest rate", "inflation", "commodity", "rupiah", "fed", "bi rate",
        "suku bunga", "inflasi", "komoditas", "ihsg", "asia market", "global market",
        "market context", "market_context", "macro", "global market", "asian markets",
    ],
    "sector": [
        "sector", "sektor", "industry", "industri", "tariff", "policy", "commodity price",
        "harga komoditas", "regulasi sektor", "sector rotation",
    ],
}

HIGH_IMPACT_MATERIALITY = {
    "earnings",
    "dividend",
    "corporate_action",
    "index",
    "regulatory",
    "management",
    "shareholder",
    "debt_rating",
    "major_contract",
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
    "laba",
    "membaik",
    "naik",
    "tumbuh",
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
    "rugi",
    "turun",
    "sanksi",
    "gugatan",
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
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
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
            return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
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


def _source_confidence_detail(source: Any, publisher: Any = None) -> dict[str, Any]:
    text = f"{source or ''} {publisher or ''}".lower()

    very_high_keywords = [
        "idx", "bei", "indonesia stock exchange", "company filing", "official disclosure",
        "keterbukaan informasi", "annual report", "financial statement", "laporan keuangan",
    ]
    high_keywords = [
        "reuters", "bloomberg", "cnbc", "kontan", "bisnis", "investor.id",
        "the jakarta post", "antara", "katadata",
    ]
    medium_keywords = [
        "newsdata", "marketaux", "finnhub", "alpha", "yahoo", "yfinance",
    ]

    if any(keyword in text for keyword in very_high_keywords):
        return {"score": 95, "label": "VERY_HIGH"}
    if any(keyword in text for keyword in high_keywords):
        return {"score": 85, "label": "HIGH"}
    if any(keyword in text for keyword in medium_keywords):
        return {"score": 70, "label": "MEDIUM"}
    if text.strip() and "unknown" not in text:
        return {"score": 60, "label": "MEDIUM"}
    return {"score": 45, "label": "LOW"}


def _source_confidence(source: Any) -> int:
    return int(_source_confidence_detail(source).get("score") or 45)


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
    event_type = str(item.get("event_type") or "general").lower().strip()
    text = f"{item.get('title') or ''} {item.get('summary') or ''} {event_type}".lower()
    for category, keywords in MATERIAL_KEYWORDS.items():
        if event_type == category or any(keyword in text for keyword in keywords):
            return 90, category
    if event_type != "general":
        return 65, event_type
    return 25, "general"


def _article_key(item: dict[str, Any]) -> str:
    url = normalize_url(str(item.get("url") or ""))
    if url:
        return url
    return normalize_title(str(item.get("title") or ""))


def _ticker_aliases(ticker: str) -> set[str]:
    raw = str(ticker or "").upper().strip()
    base = raw.removesuffix(".JK")
    aliases = {raw, base}
    if base:
        aliases.add(f"{base}.JK")
    return {item for item in aliases if item}


def _has_direct_entity_match(item: dict[str, Any], ticker: str) -> bool:
    text = f"{item.get('title') or ''} {item.get('summary') or ''} {item.get('related_ticker') or ''}".upper()
    aliases = _ticker_aliases(ticker)
    return any(alias in text for alias in aliases)


def _news_scope(item: dict[str, Any], ticker: str, materiality_category: str) -> str:
    if _has_direct_entity_match(item, ticker):
        return "company"
    if materiality_category == "index":
        return "index"
    if materiality_category == "sector":
        return "sector"
    return "market_context"


def _is_high_impact_news(
    *,
    item: dict[str, Any],
    ticker: str,
    relevance_score: float,
    impact_score: float,
    materiality_category: str,
) -> bool:
    return (
        relevance_score >= 65
        and impact_score >= 70
        and materiality_category in HIGH_IMPACT_MATERIALITY
        and _has_direct_entity_match(item, ticker)
    )


def _impact_reason(category: str, score: float, source_label: str, scope: str) -> str:
    readable_category = str(category or "general").replace("_", " ")
    readable_scope = str(scope or "market_context").replace("_", " ")
    return (
        f"Classified as {readable_category} with {score:.1f} impact score, "
        f"{source_label} source confidence, and {readable_scope} scope."
    )


def _collect_articles(related_news: dict[str, Any] | None, news_context: dict[str, Any] | None) -> list[dict[str, Any]]:
    articles: list[dict[str, Any]] = []
    context_articles = (news_context or {}).get("articles", []) if isinstance(news_context, dict) else []
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


def _empty_news_impact(status: str = "unavailable") -> dict[str, Any]:
    return {
        "available": False,
        "overall_sentiment": "neutral",
        "sentiment_score": 50,
        "high_impact_news": [],
        "full_news_list": [],
        "news_count": 0,
        "deduplicated_count": 0,
        "high_impact_count": 0,
        "full_news_count": 0,
        "duplicate_excluded_count": 0,
        "data_quality": {
            "status": status,
            "sources_used": [],
            "source_confidence_breakdown": {"VERY_HIGH": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0},
            "rules": {
                "high_impact_limited": False,
                "full_news_limited": False,
                "high_impact_removed_from_full_list": True,
            },
        },
    }


def build_news_impact(
    ticker: str,
    trade_date: str,
    related_news: dict[str, Any] | None = None,
    news_context: dict[str, Any] | None = None,
    *,
    limit: int | None = None,
) -> dict[str, Any]:
    # Backward-compatible parameter only. Final display lists must not be capped here.
    _ = limit
    raw_articles = _collect_articles(related_news, news_context)
    if not raw_articles:
        return _empty_news_impact()

    deduped = deduplicate_news(raw_articles)
    if not deduped:
        result = _empty_news_impact(status="unavailable_after_deduplication")
        result["news_count"] = len(raw_articles)
        result["duplicate_excluded_count"] = len(raw_articles)
        return result

    ranked = rank_news(deduped, ticker=ticker)
    scored: list[dict[str, Any]] = []
    sentiment_values: list[float] = []
    source_confidence_breakdown = {"VERY_HIGH": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}

    for item in ranked:
        relevance = _safe_float(item.get("relevance_score"))
        if relevance is None or relevance <= 0:
            text = f"{item.get('title') or ''} {item.get('summary') or ''}".upper()
            relevance = 70 if ticker.upper().removesuffix(".JK") in text else 45
        relevance = max(0, min(100, relevance))

        sentiment = _infer_sentiment_label(item)
        sentiment_value = _sentiment_numeric(item, sentiment)
        sentiment_values.append(sentiment_value)
        sentiment_strength = abs(sentiment_value) * 100
        recency = _recency_score(item.get("published_at"), trade_date)
        materiality, category = _materiality_score(item)
        source = item.get("source") or item.get("publisher") or "unknown"
        publisher = item.get("publisher")
        confidence = _source_confidence_detail(source, publisher)
        source_confidence_score = int(confidence.get("score") or 45)
        source_confidence_label = str(confidence.get("label") or "LOW")
        source_confidence_breakdown[source_confidence_label] = source_confidence_breakdown.get(source_confidence_label, 0) + 1

        impact_score = round(
            (relevance * 0.40)
            + (materiality * 0.30)
            + (recency * 0.15)
            + (source_confidence_score * 0.10)
            + (sentiment_strength * 0.05),
            2,
        )
        is_high = _is_high_impact_news(
            item=item,
            ticker=ticker,
            relevance_score=relevance,
            impact_score=impact_score,
            materiality_category=category,
        )
        impact = "high" if is_high else "medium" if impact_score >= 45 else "low"
        scope = _news_scope(item, ticker, category)
        key = _article_key(item)
        reason = (
            f"High impact because this article directly matches {ticker}, "
            f"falls under {category.replace('_', ' ')}, and has {impact_score:.1f} impact score."
            if is_high
            else _impact_reason(category, impact_score, source_confidence_label, scope)
        )

        scored.append(
            {
                "title": str(item.get("title") or "").strip(),
                "source": str(source or "unknown"),
                "publisher": publisher,
                "published_at": str(item.get("published_at") or "")[:10] or None,
                "sentiment": sentiment,
                "impact": impact,
                "impact_score": impact_score,
                "relevance_score": round(relevance, 2),
                "recency_score": recency,
                "materiality_score": materiality,
                "materiality_category": category,
                "source_confidence_score": source_confidence_score,
                "source_confidence_label": source_confidence_label,
                "news_scope": scope,
                "scope_label": scope.replace("_", " ").upper(),
                "impact_reason": reason,
                "summary": _clean_summary(item.get("summary")),
                "url": str(item.get("url") or ""),
                "normalized_url": normalize_url(str(item.get("url") or "")),
                "normalized_title": normalize_title(str(item.get("title") or "")),
                "dedupe_key": key,
                "is_high_impact": is_high,
            }
        )

    high_impact_news = [item for item in scored if item.get("is_high_impact")]
    high_impact_keys = {item.get("dedupe_key") for item in high_impact_news if item.get("dedupe_key")}
    full_news_list = [item for item in scored if item.get("dedupe_key") not in high_impact_keys]

    high_impact_news = sorted(
        high_impact_news,
        key=lambda item: (item.get("impact_score") or 0, item.get("published_at") or ""),
        reverse=True,
    )
    full_news_list = sorted(
        full_news_list,
        key=lambda item: (item.get("published_at") or "", item.get("relevance_score") or 0),
        reverse=True,
    )

    average_sentiment = sum(sentiment_values) / len(sentiment_values) if sentiment_values else 0
    overall_sentiment = "positive" if average_sentiment > 0.1 else "negative" if average_sentiment < -0.1 else "neutral"
    sources_used = list(dict.fromkeys(str(item.get("source") or "unknown") for item in scored))
    duplicate_excluded_count = max(0, len(raw_articles) - len(deduped))

    return {
        "available": True,
        "overall_sentiment": overall_sentiment,
        "sentiment_score": round((average_sentiment + 1) * 50, 2),
        "high_impact_news": high_impact_news,
        "full_news_list": full_news_list,
        "news_count": len(raw_articles),
        "deduplicated_count": len(deduped),
        "high_impact_count": len(high_impact_news),
        "full_news_count": len(full_news_list),
        "duplicate_excluded_count": duplicate_excluded_count,
        "data_quality": {
            "status": "available",
            "sources_used": sources_used,
            "source_confidence_breakdown": source_confidence_breakdown,
            "rules": {
                "high_impact_limited": False,
                "full_news_limited": False,
                "high_impact_removed_from_full_list": True,
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


def build_catalyst_tracker(news_impact: dict[str, Any] | None, event_risk: Any = None) -> dict[str, Any]:
    news_items = (news_impact or {}).get("full_news_list") if isinstance(news_impact, dict) else []
    if not isinstance(news_items, list):
        news_items = []
    positive: list[dict[str, Any]] = []
    negative: list[dict[str, Any]] = []
    for item in news_items:
        if not isinstance(item, dict) or item.get("impact") == "low":
            continue
        sentiment = str(item.get("sentiment") or "neutral")
        catalyst = {
            "type": _catalyst_type(item),
            "label": _label_for_catalyst(item, sentiment) if sentiment in {"positive", "negative"} else "Material news catalyst",
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
        rows = payload.get("earnings_calendar") if isinstance(payload.get("earnings_calendar"), list) else []
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
        _safe_int(row.get(key))
        for key in ("strong_buy", "buy", "hold", "sell", "strong_sell")
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

    normalized_rows = sorted(normalized_rows, key=lambda row: str(row.get("period") or ""), reverse=True)
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
        trend = "improving" if score_delta > 0.15 else "deteriorating" if score_delta < -0.15 else "stable"
    else:
        trend = "stable"

    return {
        "available": True,
        **latest,
        "consensus_label": label,
        "trend": trend,
        "data_quality": {"status": "complete", "source": "Finnhub"},
    }
