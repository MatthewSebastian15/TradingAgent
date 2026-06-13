"""Signed browser owner sessions for resource isolation."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from pathlib import Path
from typing import Any

from config import OWNER_SESSION_SECRET, OWNER_SESSION_TTL_SECONDS
from errors import AuthenticationError

_TOKEN_VERSION = 1
OWNER_SESSION_COOKIE_NAME = "ta_owner_token"
_DEV_SIGNING_SECRET: bytes | None = None
_DEV_SIGNING_SECRET_FILE = ".owner_session_secret"


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")


def _signing_secret() -> bytes:
    configured = OWNER_SESSION_SECRET.encode("utf-8")
    return configured or _persistent_dev_signing_secret()


def _persistent_dev_signing_secret() -> bytes:
    global _DEV_SIGNING_SECRET
    if _DEV_SIGNING_SECRET is not None:
        return _DEV_SIGNING_SECRET

    cache_home = Path(os.getenv("XDG_CACHE_HOME") or Path.home() / ".tradingagents" / "cache").expanduser()
    secret_path = cache_home / _DEV_SIGNING_SECRET_FILE
    try:
        secret_path.parent.mkdir(parents=True, exist_ok=True)
        secret = secret_path.read_text(encoding="utf-8").strip() if secret_path.exists() else ""
        if not secret:
            secret = secrets.token_hex(32)
            secret_path.write_text(secret, encoding="utf-8")
            try:
                secret_path.chmod(0o600)
            except OSError:
                pass
        _DEV_SIGNING_SECRET = secret.encode("utf-8")
    except OSError:
        _DEV_SIGNING_SECRET = secrets.token_bytes(32)
    return _DEV_SIGNING_SECRET


def _signature(payload: str) -> str:
    digest = hmac.new(_signing_secret(), payload.encode("ascii"), hashlib.sha256).digest()
    return _base64url_encode(digest)


def owner_identifier(owner_id: str) -> str:
    digest = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()[:24]
    return f"owner:{digest}"


def issue_owner_session(*, owner_id: str | None = None, now: int | None = None) -> dict[str, Any]:
    issued_at = int(time.time() if now is None else now)
    expires_at = issued_at + OWNER_SESSION_TTL_SECONDS
    payload = {
        "version": _TOKEN_VERSION,
        "owner_id": owner_id or uuid.uuid4().hex,
        "issued_at": issued_at,
        "expires_at": expires_at,
    }
    encoded_payload = _base64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return {
        "owner_token": f"{encoded_payload}.{_signature(encoded_payload)}",
        "expires_at": expires_at,
    }


def read_owner_session(token: str, *, now: int | None = None) -> dict[str, Any]:
    try:
        encoded_payload, supplied_signature = token.split(".", 1)
        if not hmac.compare_digest(supplied_signature, _signature(encoded_payload)):
            raise ValueError("signature mismatch")
        payload = json.loads(_base64url_decode(encoded_payload))
        owner_id = str(payload["owner_id"])
        expires_at = int(payload["expires_at"])
        version = int(payload["version"])
        uuid.UUID(hex=owner_id)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise AuthenticationError("Invalid owner session token.") from None

    current_time = int(time.time() if now is None else now)
    if version != _TOKEN_VERSION:
        raise AuthenticationError("Unsupported owner session token.")
    if expires_at <= current_time:
        raise AuthenticationError("Owner session token has expired.")
    return {"owner_id": owner_id, "expires_at": expires_at}


def owner_identifier_from_token(token: str, *, now: int | None = None) -> str:
    return owner_identifier(read_owner_session(token, now=now)["owner_id"])
