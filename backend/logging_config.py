"""Request-scoped logging helpers."""

from __future__ import annotations

import contextvars
import uuid

request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]
