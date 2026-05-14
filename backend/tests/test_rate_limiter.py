from __future__ import annotations

from rate_limiter import RateLimitPolicy


def test_rate_limit_returns_429(client, monkeypatch):
    async def fake_run_pipeline_async(req, request_id):
        return {
            "decision": "Hold",
            "full_decision": "Mocked decision",
            "executive_summary": None,
            "investment_thesis": None,
            "price_target": None,
            "time_horizon": None,
            "confidence_score": None,
            "suggested_allocation_percent": None,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward_ratio": None,
            "max_drawdown_estimate": None,
            "volatility_level": None,
            "position_sizing_reason": None,
            "rebalancing_action": None,
            "key_catalysts": [],
            "invalidation_conditions": [],
            "data_quality": {"price_data": "ok", "fundamentals": "missing", "news": "missing", "warnings": []},
        }

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)
    monkeypatch.setattr(
        "routes.analysis.request_policy",
        lambda: RateLimitPolicy(scope="request-test", max_per_minute=1, max_concurrent=1),
    )

    payload = {"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 1}
    headers = {"x-api-key": "same-api-key"}

    first = client.post("/api/analyze", json=payload, headers=headers)
    second = client.post("/api/analyze", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "RATE_LIMITED"
