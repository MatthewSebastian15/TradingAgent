from __future__ import annotations

import re


def test_validation_error_details_do_not_echo_raw_input(client):
    response = client.post(
        "/api/analysis/jobs",
        json={"ticker": "AAPL", "trade_date": "2026-05-14", "max_debate_rounds": "not-an-int"},
        headers={"x-api-key": "validation-sanitize-test-key"},
    )

    assert response.status_code == 422
    fields = response.json()["error"]["details"]["fields"]
    assert fields
    assert all("input" not in field for field in fields)


def test_request_id_header_is_sanitized(client):
    invalid_request_id = "bad id with spaces and way-too-long-" + ("x" * 100)

    response = client.get("/health", headers={"x-request-id": invalid_request_id})

    assert response.status_code == 200
    assert response.headers["x-request-id"] != invalid_request_id
    assert re.fullmatch(r"[a-f0-9]{12}", response.headers["x-request-id"])


def test_caller_request_id_header_is_replaced_by_server_trace_id(client):
    response = client.get("/health", headers={"x-request-id": "dev-request_01:trace"})

    assert response.status_code == 200
    assert response.headers["x-request-id"] != "dev-request_01:trace"
    assert len(response.headers["x-request-id"]) == 12
