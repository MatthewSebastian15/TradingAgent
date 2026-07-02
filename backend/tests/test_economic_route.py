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
