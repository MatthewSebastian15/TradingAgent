from __future__ import annotations


def test_analyze_accepts_valid_request_and_returns_result(client, monkeypatch):
    async def fake_run_pipeline_async(req, request_id):
        return {
            "decision": "Buy",
            "full_decision": "Mocked final decision",
            "executive_summary": "Mocked summary",
            "investment_thesis": "Mocked thesis",
            "price_target": 10000,
            "time_horizon": "1M",
            "confidence_score": 0.8,
            "suggested_allocation_percent": 10,
            "entry_price": 9000,
            "stop_loss": 8500,
            "take_profit": 10000,
            "risk_reward_ratio": 2.0,
            "max_drawdown_estimate": 0.08,
            "volatility_level": "medium",
            "position_sizing_reason": "Test sizing",
            "rebalancing_action": "No change",
            "key_catalysts": ["earnings"],
            "invalidation_conditions": ["breakdown"],
            "data_quality": {"price_data": "ok", "fundamentals": "ok", "news": "ok", "warnings": []},
        }

    monkeypatch.setattr("routes.analysis._run_pipeline_async", fake_run_pipeline_async)

    response = client.post(
        "/api/analyze",
        json={"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 3},
        headers={"x-api-key": "route-test-key"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ticker"] == "BBCA.JK"
    assert body["trade_date"] == "2026-05-14"
    assert body["decision"] == "Buy"
    assert body["data_quality"]["price_data"] == "ok"


def test_analyze_rejects_invalid_date_before_pipeline_runs(client, monkeypatch):
    async def should_not_run(*args, **kwargs):
        raise AssertionError("Pipeline should not run for invalid input")

    monkeypatch.setattr("routes.analysis._run_pipeline_async", should_not_run)

    response = client.post(
        "/api/analyze",
        json={"ticker": "BBCA.JK", "trade_date": "2026-99-99", "max_debate_rounds": 1},
        headers={"x-api-key": "validation-test-key"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"
    assert "trade_date" in response.json()["error"]["details"]["fields"]
