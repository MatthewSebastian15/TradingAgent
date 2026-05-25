"""Request-scoped logging helpers."""

from __future__ import annotations

import contextvars
import logging
import re
import time
import uuid
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]


def normalize_request_id(value: str | None) -> str:
    candidate = (value or "").strip()
    if _REQUEST_ID_RE.fullmatch(candidate):
        return candidate
    return new_request_id()


class RequestIdFilter(logging.Filter):
    """Inject the active request_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


def configure_logging(level: int = logging.INFO) -> None:
    """Configure simple structured-ish logs with request IDs."""
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)s [request_id=%(request_id)s] %(name)s: %(message)s",
        )
    root.setLevel(level)

    request_filter = RequestIdFilter()
    for handler in root.handlers:
        if not any(isinstance(existing, RequestIdFilter) for existing in handler.filters):
            handler.addFilter(request_filter)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Create a request ID for every request and return it to the client."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = normalize_request_id(request.headers.get("x-request-id"))
        token = request_id_ctx.set(request_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logging.getLogger(__name__).info(
                "Request completed",
                extra={
                    "event": "request_completed",
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                },
            )
            request_id_ctx.reset(token)

        response.headers["x-request-id"] = request_id
        return response
