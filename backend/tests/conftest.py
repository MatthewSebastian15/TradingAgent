"""Shared fixtures for FastAPI backend tests.

The backend imports config at module import time, so this file prepares safe
default environment values before tests import the FastAPI app.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

_DEFAULT_ENV = {
    "APP_ENV": "test",
    "LLM_PROVIDER": "google",
    "GOOGLE_API_KEY": "test-google-key",
    "GEMINI_API_KEY": "test-gemini-key",
    "DEEPSEEK_API_KEY": "test-deepseek-key",
    "ANALYSIS_MODE": "balanced",
    "MAX_GEMINI_CALLS": "9",
    "PIPELINE_TIMEOUT_SECONDS": "30",
    "REQUEST_RATE_LIMIT_PER_MINUTE": "1000",
    "STREAM_RATE_LIMIT_PER_MINUTE": "1000",
    "MAX_CONCURRENT_REQUESTS_PER_KEY": "1000",
    "MAX_CONCURRENT_STREAMS_PER_KEY": "1000",
    "REQUIRE_API_KEY_FOR_RATE_LIMIT": "false",
    "TRADINGAGENTS_SKIP_DOTENV": "true",
}

for key, value in _DEFAULT_ENV.items():
    os.environ.setdefault(key, value)


@pytest.fixture(autouse=True)
def clear_rate_limiter_state():
    from rate_limiter import reset_rate_limiter_for_tests

    reset_rate_limiter_for_tests()
    yield
    reset_rate_limiter_for_tests()


@pytest.fixture()
def client() -> TestClient:
    from main import app

    return TestClient(app)
