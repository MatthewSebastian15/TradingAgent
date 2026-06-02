"""Seed one stable SQLite analysis snapshot for report and history debugging."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.analysis_repository import get_analysis_repository  # noqa: E402

MOCK_JOB_ID = "mock-seed-nvda-job"
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
    "entry_price": 184.50,
    "stop_loss": 178.90,
    "take_profit": 201.30,
    "risk_reward_ratio": 3.0,
    "risk_reward_display": "1:3",
    "max_drawdown_estimate": "8-12%",
    "volatility_level": "Medium",
    "volatility_score": 62,
    "rebalancing_action": "Hold current allocation",
    "position_action": "Hold existing position",
    "new_entry_action": "Wait for pullback",
    "position_size_hint": "Use a small to medium position.",
    "executive_summary": "Seeded mock snapshot for SQLite history and backend report debugging.",
    "investment_thesis": "This is static development data. It does not contain a live market recommendation.",
    "key_catalysts": ["Mock catalyst for report layout testing."],
    "invalidation_conditions": ["Mock invalidation condition for report layout testing."],
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
