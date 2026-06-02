from __future__ import annotations

import json
from typing import Any

from .finnhub_common import FinnhubUnavailableError, build_metadata, handle_finnhub_error, make_api_request


def _dump(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False, default=str)


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_news_sentiment(ticker: str) -> str:
    try:
        payload = make_api_request("/news-sentiment", {"symbol": ticker}, feature_key="enable_sentiment")
        if not isinstance(payload, dict) or not payload:
            raise FinnhubUnavailableError("News sentiment response is empty.")

        sentiment = payload.get("sentiment") if isinstance(payload.get("sentiment"), dict) else {}
        sector = payload.get("sectorAverageBullishPercent") or payload.get("sectorAverageNewsScore")
        normalized = {
            "buzz_score": _as_float((payload.get("buzz") or {}).get("buzz"))
            if isinstance(payload.get("buzz"), dict)
            else None,
            "company_news_score": _as_float(sentiment.get("companyNewsScore")),
            "bullish_percent": _as_float(sentiment.get("bullishPercent")),
            "bearish_percent": _as_float(sentiment.get("bearishPercent")),
            "neutral_percent": _as_float(sentiment.get("neutralPercent")),
            "sector_average_bullish_percent": _as_float(payload.get("sectorAverageBullishPercent")),
            "sector_average_news_score": _as_float(payload.get("sectorAverageNewsScore")),
        }
        if all(value is None for value in normalized.values()) and not sector:
            raise FinnhubUnavailableError("No structured news sentiment scores were available.")

        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "available": True,
                "news_sentiment": normalized,
                "metadata": build_metadata("/news-sentiment", is_enrichment=True, confidence="medium"),
            }
        )
    except Exception as exc:
        return handle_finnhub_error(f"news sentiment for {ticker}", exc, fallback_next="alpha_vantage")


def _summarize_social(reddit: list[Any], twitter: list[Any]) -> dict[str, Any]:
    reddit_mentions = sum(int(item.get("mention", 0) or 0) for item in reddit if isinstance(item, dict))
    twitter_mentions = sum(int(item.get("mention", 0) or 0) for item in twitter if isinstance(item, dict))
    positives = 0.0
    negatives = 0.0
    for item in [*reddit, *twitter]:
        if not isinstance(item, dict):
            continue
        positives += float(item.get("positiveMention", 0) or 0)
        negatives += float(item.get("negativeMention", 0) or 0)
    if positives > negatives:
        dominant = "positive"
    elif negatives > positives:
        dominant = "negative"
    elif reddit_mentions + twitter_mentions > 0:
        dominant = "neutral"
    else:
        dominant = "unavailable"
    return {
        "reddit_mentions": reddit_mentions,
        "twitter_mentions": twitter_mentions,
        "total_mentions": reddit_mentions + twitter_mentions,
        "dominant_sentiment": dominant,
    }


def get_social_sentiment(ticker: str, start_date: str, end_date: str) -> str:
    try:
        payload = make_api_request(
            "/stock/social-sentiment",
            {"symbol": ticker, "from": start_date, "to": end_date},
            feature_key="enable_sentiment",
        )
        if not isinstance(payload, dict):
            raise FinnhubUnavailableError("Social sentiment response is not an object.")
        reddit = payload.get("reddit") if isinstance(payload.get("reddit"), list) else []
        twitter = payload.get("twitter") if isinstance(payload.get("twitter"), list) else []
        if not reddit and not twitter:
            raise FinnhubUnavailableError("No social sentiment data returned for this ticker.")
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "available": True,
                "reddit": reddit,
                "twitter": twitter,
                "summary": _summarize_social(reddit, twitter),
                "metadata": build_metadata("/stock/social-sentiment", is_enrichment=True, confidence="medium"),
            }
        )
    except Exception as exc:
        return _dump(
            {
                "symbol": ticker,
                "source": "finnhub",
                "available": False,
                "reason": str(exc),
                "fallback": "Use news sentiment as a separate proxy signal only; do not label it as direct social media sentiment.",
                "metadata": build_metadata(
                    "/stock/social-sentiment",
                    is_enrichment=True,
                    confidence="unavailable",
                    missing_fields=["reddit", "twitter"],
                ),
            }
        )
