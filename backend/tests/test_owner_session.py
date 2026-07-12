from __future__ import annotations

import pytest

from config import OWNER_SESSION_TTL_SECONDS
from errors import AuthenticationError
from owner_session import (
    issue_owner_session,
    owner_identifier,
    owner_identifier_from_token,
    read_owner_session,
)


def test_owner_session_token_is_signed_and_expires():
    session = issue_owner_session(owner_id="a" * 32, now=100)

    assert owner_identifier_from_token(session["owner_token"], now=101) == owner_identifier(
        "a" * 32
    )
    assert read_owner_session(session["owner_token"], now=101) == {
        "owner_id": "a" * 32,
        "expires_at": 100 + OWNER_SESSION_TTL_SECONDS,
    }
    with pytest.raises(AuthenticationError, match="expired"):
        owner_identifier_from_token(session["owner_token"], now=100 + OWNER_SESSION_TTL_SECONDS)


def test_owner_session_token_rejects_tampered_signature():
    session = issue_owner_session(owner_id="b" * 32)

    with pytest.raises(AuthenticationError, match="Invalid"):
        owner_identifier_from_token(f"{session['owner_token']}x")


def test_session_endpoint_validates_service_credential_reuses_cookie_and_issues_distinct_owners(
    client, monkeypatch
):
    monkeypatch.setattr("rate_limiter.API_KEY", "shared-proxy-key")
    client.headers.pop("x-owner-token", None)

    rejected = client.post("/api/session", headers={"x-api-key": "wrong-key"})
    first = client.post("/api/session", headers={"x-api-key": "shared-proxy-key"})
    second = client.post("/api/session", headers={"x-api-key": "shared-proxy-key"})
    client.cookies.clear()
    third = client.post("/api/session", headers={"x-api-key": "shared-proxy-key"})

    assert rejected.status_code == 401
    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 200
    assert first.json()["owner_token"] == second.json()["owner_token"]
    assert first.json()["owner_token"] != third.json()["owner_token"]
