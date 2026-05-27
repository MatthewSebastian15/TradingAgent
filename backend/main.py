from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from body_limit import RequestBodyLimitMiddleware
from config import APP_NAME, CORS_ORIGINS, REQUEST_BODY_MAX_BYTES, llm, validate_startup_config
from errors import (
    ApiError,
    api_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from logging_config import RequestIdMiddleware, configure_logging
from routes.analysis import router as analysis_router
from routes.analysis import shutdown_executor
from routes.market import router as market_router
from routes.reports import router as reports_router

configure_logging()
logger = logging.getLogger(__name__)


class SkipSseCompressionMiddleware:
    """Keep SSE responses uncompressed so progress events flush immediately."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http" and self._is_sse_path(scope.get("path", "")):
            scope = dict(scope)
            scope["headers"] = [
                (name, value) for name, value in scope.get("headers", []) if name.lower() != b"accept-encoding"
            ]
        await self.app(scope, receive, send)

    @staticmethod
    def _is_sse_path(path: str) -> bool:
        return path == "/api/analyze/stream" or (path.startswith("/api/analysis/jobs/") and path.endswith("/events"))


async def validate_config() -> None:
    """Fail fast when provider keys, models, or writable dirs are invalid."""
    errors = validate_startup_config()

    if errors:
        for msg in errors:
            logger.critical("STARTUP CONFIG ERROR: %s", msg)
        logger.critical("%d config error(s) found. Fix them and restart the server.", len(errors))
        sys.exit(1)

    logger.info(
        "Startup validation passed. Provider: %s | deep: %s | quick: %s",
        llm.provider,
        llm.deep_think_llm,
        llm.quick_think_llm,
    )


async def shutdown_resources() -> None:
    """Release process-pool workers on server shutdown."""
    await shutdown_executor()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await validate_config()
    try:
        yield
    finally:
        await shutdown_resources()


app = FastAPI(title=APP_NAME, lifespan=lifespan)

app.add_middleware(RequestBodyLimitMiddleware, max_bytes=REQUEST_BODY_MAX_BYTES)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(SkipSseCompressionMiddleware)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    # Whitelist only the headers the API actually needs.
    # Wildcard "*" permits arbitrary custom headers and bypasses
    # browser preflight protection for sensitive header names.
    allow_headers=["Content-Type", "x-api-key", "Authorization", "x-session-id"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(analysis_router, prefix="/api")
app.include_router(market_router, prefix="/api")
app.include_router(reports_router, prefix="/api")


@app.get("/health", tags=["ops"])
async def health_check() -> dict:
    """Lightweight liveness probe for Docker healthcheck and load balancers."""
    return {"status": "ok", "provider": llm.provider}
