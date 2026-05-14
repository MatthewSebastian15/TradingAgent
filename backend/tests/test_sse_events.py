from __future__ import annotations

import json


def _collect_sse_events(response_text: str) -> list[tuple[str | None, dict]]:
    events: list[tuple[str | None, dict]] = []
    current_event: str | None = None

    for raw_line in response_text.splitlines():
        line = raw_line.strip()
        if not line:
            current_event = None
            continue
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ")
        elif line.startswith("data: "):
            events.append((current_event, json.loads(line.removeprefix("data: "))))

    return events


def test_sse_sends_progress_and_final_result(client, monkeypatch):
    def fake_run_pipeline_with_progress(ticker, trade_date, max_debate_rounds, request_id, progress_callback=None):
        if progress_callback:
            progress_callback(
                {
                    "agent_id": "market_analyst",
                    "agent_name": "Market Analyst",
                    "status": "completed",
                    "status_message": "Mock market analysis completed.",
                }
            )
        return {
            "decision": "Buy",
            "full_decision": "Mocked streaming decision",
            "executive_summary": "Streaming summary",
            "investment_thesis": "Streaming thesis",
            "price_target": 10000,
            "time_horizon": "1M",
            "confidence_score": 0.75,
            "suggested_allocation_percent": 8,
            "entry_price": 9200,
            "stop_loss": 8800,
            "take_profit": 10000,
            "risk_reward_ratio": 2.0,
            "max_drawdown_estimate": 0.07,
            "volatility_level": "medium",
            "position_sizing_reason": "Mock position sizing",
            "rebalancing_action": "Hold current allocation",
            "key_catalysts": ["volume"],
            "invalidation_conditions": ["support break"],
            "data_quality": {"price_data": "ok", "fundamentals": "partial", "news": "missing", "warnings": []},
        }

    monkeypatch.setattr("routes.analysis._run_pipeline_with_progress", fake_run_pipeline_with_progress)

    with client.stream(
        "POST",
        "/api/analyze/stream",
        json={"ticker": "BBCA.JK", "trade_date": "2026-05-14", "max_debate_rounds": 1},
        headers={"x-api-key": "sse-test-key"},
    ) as response:
        assert response.status_code == 200
        events = _collect_sse_events(response.read().decode("utf-8"))

    event_names = [name for name, _ in events]
    assert "progress" in event_names
    assert "result" in event_names

    result_payload = next(payload for name, payload in events if name == "result")
    assert result_payload["ticker"] == "BBCA.JK"
    assert result_payload["decision"] == "Buy"
    assert result_payload["data_quality"]["price_data"] == "ok"
