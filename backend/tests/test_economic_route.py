"""Route tests for /api/economic/{source}/{command} — service mocked."""

from __future__ import annotations

from errors import BadRequestError, PipelineExecutionError


def test_economic_route_happy_path(client, monkeypatch):
    async def fake_service(source, command, params):
        assert (source, command) == ("federal_reserve", "sofr_rate")
        assert params == {"days": "30"}
        return {
            "success": True,
            "source": source,
            "command": command,
            "valueType": "percent",
            "data": [],
        }

    monkeypatch.setattr("routes.economic.get_economic_data", fake_service)

    response = client.get("/api/economic/federal_reserve/sofr_rate?days=30")
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["valueType"] == "percent"


def test_economic_route_enforces_rate_limit(client, monkeypatch):
    from rate_limiter import MemoryRateLimiterBackend, RateLimitPolicy

    monkeypatch.setattr(
        "routes.economic._ECONOMIC_POLICY",
        RateLimitPolicy(scope="economic", max_per_minute=2, max_concurrent=16),
    )
    # Fresh in-memory backend so a sqlite RATE_LIMIT_STORAGE_BACKEND in the local
    # .env cannot leak timestamps across tests.
    monkeypatch.setattr(
        client.app.state, "rate_limiter_backend", MemoryRateLimiterBackend(), raising=False
    )

    async def fake_service(source, command, params):
        return {
            "success": True,
            "source": source,
            "command": command,
            "valueType": "percent",
            "data": [],
        }

    monkeypatch.setattr("routes.economic.get_economic_data", fake_service)

    for _ in range(2):
        assert client.get("/api/economic/federal_reserve/sofr_rate").status_code == 200
    response = client.get("/api/economic/federal_reserve/sofr_rate")
    assert response.status_code == 429


def test_economic_route_bad_params_return_400(client, monkeypatch):
    async def fake_service(source, command, params):
        raise BadRequestError(f"Unknown economic source/command: {source}/{command}")

    monkeypatch.setattr("routes.economic.get_economic_data", fake_service)

    response = client.get("/api/economic/bogus/nothing")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_economic_route_vendor_failure_maps_500_without_leaking(client, monkeypatch):
    async def fake_service(source, command, params):
        raise PipelineExecutionError("urllib timeout at /secret/path/economic_service.py")

    monkeypatch.setattr("routes.economic.get_economic_data", fake_service)

    response = client.get("/api/economic/federal_reserve/sofr_rate")
    assert response.status_code == 500
    body = response.text
    assert response.json()["error"]["code"] == "PIPELINE_FAILED"
    # internal_message / stack traces never reach the client
    assert "secret/path" not in body
    assert "Traceback" not in body
