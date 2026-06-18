"""Seed one stable SQLite analysis snapshot for report and history debugging."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.analysis_repository import get_analysis_repository  # noqa: E402

MOCK_JOB_ID = "mock-seed-nvda-job"


def _mock_high_impact_news(index: int) -> dict[str, object]:
    confidence_label = (
        "VERY_HIGH" if index == 1 else "HIGH" if index <= 4 else "LOW" if index == 7 else "MEDIUM"
    )
    source = "IDX Official Disclosure" if index == 1 else "Local Blog" if index == 7 else "Reuters"
    return {
        "title": f"High Impact NVDA News {index}",
        "source": source,
        "publisher": "IDX" if index == 1 else source,
        "published_at": f"2026-06-{index:02d}",
        "sentiment": "negative" if index % 2 == 0 else "neutral",
        "impact": "high",
        "impact_score": 80 + index,
        "relevance_score": 90,
        "recency_score": 85,
        "materiality_score": 90,
        "materiality_category": "index" if index % 2 == 0 else "corporate_action",
        "source_confidence_score": 95
        if index == 1
        else 85
        if index <= 4
        else 45
        if index == 7
        else 70,
        "source_confidence_label": confidence_label,
        "news_scope": "company",
        "scope_label": "COMPANY",
        "impact_reason": (
            "High impact because this article directly matches NVDA and passes materiality filter "
            f"{index}."
        ),
        "summary": f"Mock high impact summary {index}.",
        "url": f"https://example.com/nvda-high-{index}",
        "normalized_url": f"example.com/nvda-high-{index}",
        "normalized_title": f"high impact nvda news {index}",
        "dedupe_key": f"high-nvda-{index}",
        "is_high_impact": True,
    }


def _mock_full_news(index: int, scope: str = "company") -> dict[str, object]:
    scope_label = scope.replace("_", " ").upper()
    return {
        "title": (
            f"{'Market Context News' if scope == 'market_context' else 'Full News NVDA Article'} "
            f"{index}"
        ),
        "source": "NewsData" if index % 3 == 0 else "MarketAux",
        "publisher": "NewsData" if index % 3 == 0 else "MarketAux",
        "published_at": f"2026-05-{index:02d}",
        "sentiment": "neutral",
        "impact": "medium",
        "impact_score": 45 + index,
        "relevance_score": 66 if scope == "market_context" else 72,
        "recency_score": 55,
        "materiality_score": 45 if scope == "market_context" else 65,
        "materiality_category": "market_context" if scope == "market_context" else "sector",
        "source_confidence_score": 70,
        "source_confidence_label": "MEDIUM",
        "news_scope": scope,
        "scope_label": scope_label,
        "impact_reason": (
            (
                "Included as market context and not classified as high impact because it does "
                + "not directly match the ticker."
            )
            if scope == "market_context"
            else "Included as related full news but below high-impact threshold."
        ),
        "summary": f"Mock full news summary {index}.",
        "url": f"https://example.com/nvda-full-{index}",
        "normalized_url": f"example.com/nvda-full-{index}",
        "normalized_title": f"full news nvda article {index}",
        "dedupe_key": f"full-nvda-{index}",
        "is_high_impact": False,
    }


MOCK_RESULT = {
    "request_id": "mock-seed-nvda-buy",
    "job_id": MOCK_JOB_ID,
    "ticker": "NVDA",
    "market": "US",
    "trade_date": "2026-05-28",
    "analysis_created_at": "2026-05-28T08:00:00+00:00",
    "analysis_depth": "balanced",
    "response_detail": "full",
    "time_horizon_months": 1,
    "current_price": 185.25,
    "current_price_as_of": "2026-05-28",
    "current_price_source": "mock:yfinance:last_close",
    "llm_decision": "Buy",
    "final_decision": "Buy",
    "decision": "Buy",
    "decision_adjusted": False,
    "trade_plan_valid": True,
    "has_existing_position": False,
    "position_quantity": None,
    "average_entry_price": None,
    "entry_price": 184.50,
    "stop_loss": 178.90,
    "take_profit": 201.30,
    "risk_reward_ratio": 3.0,
    "risk_reward_display": "1:3",
    "max_drawdown_estimate": "8-12%",
    "volatility_level": "Medium",
    "volatility_score": 62,
    "rebalancing_action": "Open new position",
    "position_action": None,
    "new_entry_action": "Allowed with validated entry",
    "position_size_hint": "Use standard starter size and avoid oversized entry.",
    "executive_summary": "Seeded mock snapshot for SQLite history and backend report debugging.",
    ("investment_thesis"): (
        "This is static development data. It does not contain a live market recommendation."
    ),
    "key_catalysts": ["Mock catalyst for report layout testing."],
    "invalidation_conditions": ["Mock invalidation condition for report layout testing."],
    "related_news": {
        "available": True,
        "ticker": "NVDA",
        "trade_date": "2026-05-28",
        "lookback_days": 30,
        "source": "mock",
        "summary": "Seeded related news payload kept only as a legacy fallback.",
        "items": [_mock_full_news(1), _mock_full_news(2), _mock_full_news(3)],
    },
    "news_impact": {
        "available": True,
        "overall_sentiment": "neutral",
        "sentiment_score": 52,
        "news_count": 24,
        "deduplicated_count": 18,
        "high_impact_count": 7,
        "full_news_count": 11,
        "duplicate_excluded_count": 6,
        "high_impact_news": [_mock_high_impact_news(index) for index in range(1, 8)],
        "full_news_list": [
            *[_mock_full_news(index) for index in range(1, 10)],
            _mock_full_news(10, "market_context"),
            _mock_full_news(11, "market_context"),
        ],
        "data_quality": {
            "status": "available",
            "sources_used": ["IDX Official Disclosure", "Reuters", "NewsData", "MarketAux"],
            "source_confidence_breakdown": {
                "VERY_HIGH": 1,
                "HIGH": 3,
                "MEDIUM": 13,
                "LOW": 1,
            },
            "rules": {
                "high_impact_limited": False,
                "full_news_limited": False,
                "high_impact_removed_from_full_list": True,
            },
        },
    },
    "data_quality": {
        "price_data": "mock",
        "trade_levels": "mock_validated",
        "llm_output": "mock",
        "volatility_data": "mock",
        "warnings": ["Seeded mock data only. No provider or LLM call was executed."],
    },
}


def main() -> None:
    repository = get_analysis_repository()
    repository.save_analysis(
        result=MOCK_RESULT,
        request_payload={"mock": True, "ticker": "NVDA", "trade_date": "2026-05-28"},
        job_id=MOCK_JOB_ID,
    )
    print("Seeded analysis history snapshot:")
    print(f"  request_id: {MOCK_RESULT['request_id']}")
    print(f"  job_id:     {MOCK_JOB_ID}")


if __name__ == "__main__":
    main()
