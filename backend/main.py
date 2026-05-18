from __future__ import annotations

import logging
import sys

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import APP_NAME, CORS_ORIGINS, APP_ENV, validate_startup_config, llm
from errors import (
    ApiError,
    api_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from logging_config import RequestIdMiddleware, configure_logging
from routes.analysis import router as analysis_router

configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title=APP_NAME)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    # Whitelist only the headers the API actually needs.
    # Wildcard "*" permits arbitrary custom headers and bypasses
    # browser preflight protection for sensitive header names.
    allow_headers=["Content-Type", "x-api-key", "Authorization"],
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(analysis_router, prefix="/api")


@app.get("/health", tags=["ops"])
async def health_check() -> dict:
    """Lightweight liveness probe for Docker healthcheck and load balancers."""
    return {"status": "ok", "provider": llm.provider}


@app.on_event("startup")
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
