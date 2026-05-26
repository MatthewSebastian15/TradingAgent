"""Consistent API exceptions and sanitized error responses."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from logging_config import request_id_ctx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sanitization patterns
# ---------------------------------------------------------------------------

_SECRET_PATTERNS = [
    # API keys and secrets in key=value form
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;&]+"),
    # OpenAI-style secret keys
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    # Google/Firebase API keys
    re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    # Windows drive paths (e.g. C:\Users\...)
    re.compile(r"[A-Za-z]:\\[^\s]+"),
    # Windows UNC paths (e.g. \\server\share\...)
    re.compile(r"\\\\[^\s]+"),
    # Unix paths starting with /mnt, /home, /root, /tmp
    re.compile(r"(?:/mnt|/home|/root|/tmp)/[^\s]+"),
]

_MAX_MESSAGE_LENGTH = 500


def sanitize_message(message: str) -> str:
    """Redact secrets and filesystem paths, then truncate to a safe length."""
    cleaned = str(message or "")
    for pattern in _SECRET_PATTERNS:
        cleaned = pattern.sub("[redacted]", cleaned)
    return cleaned[:_MAX_MESSAGE_LENGTH]


def sanitize_validation_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove raw user input from Pydantic validation errors before responding."""
    sanitized: list[dict[str, Any]] = []
    for error in errors:
        clean = dict(error)
        clean.pop("input", None)
        sanitized.append(clean)
    return sanitized


# ---------------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------------


@dataclass
class ApiError(Exception):
    status_code: int
    code: str
    user_message: str
    details: dict[str, Any] | None = None
    internal_message: str | None = None


class BadRequestError(ApiError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(400, "BAD_REQUEST", message, details)


class NotFoundError(ApiError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(404, "NOT_FOUND", message, details)


class RateLimitError(ApiError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(429, "RATE_LIMITED", message, details)


class PipelineTimeoutError(ApiError):
    def __init__(self, seconds: int) -> None:
        super().__init__(
            504,
            "PIPELINE_TIMEOUT",
            f"Analysis timed out after {seconds} seconds. Try fewer debate rounds.",
        )


class PipelineExecutionError(ApiError):
    def __init__(self, internal_message: str | None = None) -> None:
        super().__init__(
            500,
            "PIPELINE_FAILED",
            "Analysis failed. Check backend logs with the request_id.",
            internal_message=internal_message,
        )


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def error_payload(error: ApiError) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "request_id": request_id_ctx.get(),
        "error": {
            "code": error.code,
            "message": sanitize_message(error.user_message),
        },
    }
    if error.details:
        payload["error"]["details"] = error.details
    return payload


# ---------------------------------------------------------------------------
# FastAPI exception handlers
# ---------------------------------------------------------------------------


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    if exc.status_code >= 500:
        logger.error(
            "API error [%s]: %s",
            exc.code,
            exc.internal_message or exc.user_message,
            exc_info=True,
        )
    return JSONResponse(status_code=exc.status_code, content=error_payload(exc))


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    api_error = ApiError(
        status_code=exc.status_code,
        code="HTTP_ERROR",
        user_message=sanitize_message(message),
        details=exc.detail if isinstance(exc.detail, dict) else None,
    )
    return JSONResponse(status_code=exc.status_code, content=error_payload(api_error))


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details = {"fields": sanitize_validation_errors(exc.errors())}
    api_error = ApiError(422, "VALIDATION_ERROR", "Invalid request payload.", details=details)
    return JSONResponse(status_code=422, content=error_payload(api_error))


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled request error")
    api_error = PipelineExecutionError(internal_message=str(exc))
    return JSONResponse(status_code=500, content=error_payload(api_error))
