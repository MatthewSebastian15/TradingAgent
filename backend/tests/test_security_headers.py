"""Security headers set by SecurityHeadersMiddleware on every HTTP response."""

from __future__ import annotations


def test_security_headers_present(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
