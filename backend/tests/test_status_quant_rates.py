from __future__ import annotations


def test_status_exposes_quant_risk_free_rates(client, monkeypatch):
    monkeypatch.setattr("routes.analysis.QUANT_RISK_FREE_RATES", {"US": 0.04, "JK": 0.06})

    response = client.get("/api/status")

    assert response.status_code == 200
    assert response.json()["quant_risk_free_rates"] == {"US": 0.04, "JK": 0.06}
