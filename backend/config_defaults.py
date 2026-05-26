"""Non-secret backend settings and operational defaults."""

from __future__ import annotations

import logging
import os

from config_env import BASE_DIR, env, env_bool, env_int, env_list

logger = logging.getLogger("config")

# App
APP_NAME = "TradingAgents API"
APP_ENV = env("APP_ENV", "production").lower()
_IS_PRODUCTION = APP_ENV == "production"

# Ports
BACKEND_PORT = 8000
FRONTEND_PORT = 3000

# CORS. Production defaults to same-origin only; set CORS_ORIGINS to a
# comma-separated allowlist when the frontend is deployed on another origin.
_DEFAULT_CORS_ORIGINS: list[str] = (
    []
    if _IS_PRODUCTION
    else [
        f"http://localhost:{FRONTEND_PORT}",
        "http://localhost:5173",
    ]
)
CORS_ORIGINS: list[str] = env_list("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)

# Pipeline tunables
PIPELINE_TIMEOUT_SECONDS = env_int("PIPELINE_TIMEOUT_SECONDS", 600, min_value=1)
PREFLIGHT_TIMEOUT_SECONDS = min(env_int("PREFLIGHT_TIMEOUT_SECONDS", 30, min_value=1), PIPELINE_TIMEOUT_SECONDS)
PROCESS_POOL_WORKERS = min(env_int("PROCESS_POOL_WORKERS", 2, min_value=1), os.cpu_count() or 2)
PROCESS_POOL_MAX_TASKS_PER_CHILD = env_int("PROCESS_POOL_MAX_TASKS_PER_CHILD", 1, min_value=1)
DATA_COLLECTION_WORKERS = env_int("DATA_COLLECTION_WORKERS", 6, min_value=1)
ANALYST_PARALLEL_WORKERS = env_int("ANALYST_PARALLEL_WORKERS", 3, min_value=1)
DEFAULT_MAX_DEBATE_ROUNDS = env_int("DEFAULT_MAX_DEBATE_ROUNDS", 3, min_value=1)
MAX_RISK_DISCUSS_ROUNDS = 1
ANALYSIS_MODE = "balanced"
DEFAULT_ANALYSIS_DEPTH = "balanced"
ANALYSIS_DEPTHS: tuple[str, ...] = ("fast", "balanced", "deep")
RESPONSE_DETAILS: tuple[str, ...] = ("summary", "full", "debug")

# Actual LLM call budgets enforced inside the balanced pipeline.
# Fast mode skips the debate/risk committee and keeps a final PM call.
ANALYSIS_DEPTH_LLM_BUDGETS: dict[str, int] = {
    "fast": 6,
    "balanced": 9,
    "deep": 9,
}
MAX_GEMINI_CALLS = ANALYSIS_DEPTH_LLM_BUDGETS[DEFAULT_ANALYSIS_DEPTH]

# Rate limiting
REQUEST_RATE_LIMIT_PER_MINUTE = env_int("REQUEST_RATE_LIMIT_PER_MINUTE", 20, min_value=1)
STREAM_RATE_LIMIT_PER_MINUTE = env_int("STREAM_RATE_LIMIT_PER_MINUTE", 8, min_value=1)
MAX_CONCURRENT_REQUESTS_PER_KEY = env_int("MAX_CONCURRENT_REQUESTS_PER_KEY", 2, min_value=1)
MAX_CONCURRENT_STREAMS_PER_KEY = env_int("MAX_CONCURRENT_STREAMS_PER_KEY", 1, min_value=1)
REQUEST_BODY_MAX_BYTES = env_int("REQUEST_BODY_MAX_BYTES", 64 * 1024, min_value=1024)
REQUIRE_API_KEY_FOR_RATE_LIMIT = env_bool("REQUIRE_API_KEY_FOR_RATE_LIMIT", _IS_PRODUCTION)
if _IS_PRODUCTION and not REQUIRE_API_KEY_FOR_RATE_LIMIT:
    logger.warning(
        "APP_ENV=production but REQUIRE_API_KEY_FOR_RATE_LIMIT is disabled; "
        "anonymous clients will be accepted and rate-limited by IP only."
    )

# LLM resilience
LLM_TIMEOUT_SECONDS = env_int("LLM_TIMEOUT_SECONDS", 60, min_value=1)
LLM_MAX_RETRIES = env_int("LLM_MAX_RETRIES", 2, min_value=1)
PROVIDER_SDK_MAX_RETRIES = env_int("PROVIDER_SDK_MAX_RETRIES", 0, min_value=0)
LLM_RETRIES_BY_DEPTH: dict[str, int] = {
    "fast": 1,
    "balanced": 2,
    "deep": 3,
}
LLM_RETRY_BASE_DELAY = 1.5
LLM_RETRY_MAX_DELAY = 30
LLM_429_MAX_WAIT_SECONDS = 20
MAX_CONCURRENT_LLM_CALLS = 3

# Cache
CACHE_TTL_SECONDS = env_int("CACHE_TTL_SECONDS", 900, min_value=1)
CACHE_MAX_ENTRIES = env_int("CACHE_MAX_ENTRIES", 512, min_value=1)
ANALYSIS_RESULT_CACHE_TTL_SECONDS = 60 * 60 * 8
ANALYSIS_RESULT_CACHE_MAX_ENTRIES = 256
ANALYSIS_JOB_TTL_SECONDS = 60 * 60 * 8
ANALYSIS_JOB_MAX_ENTRIES = 256
ANALYSIS_JOB_MAX_ACTIVE = min(env_int("ANALYSIS_JOB_MAX_ACTIVE", 32, min_value=1), ANALYSIS_JOB_MAX_ENTRIES)
ANALYSIS_JOB_EVENT_REPLAY_LIMIT = env_int("ANALYSIS_JOB_EVENT_REPLAY_LIMIT", 500, min_value=1)
ANALYSIS_JOB_CACHE_DB_PATH = str(BASE_DIR / ".cache" / "analysis_jobs.sqlite3")
DATA_CACHE_BACKEND = "sqlite"
DATA_CACHE_DB_PATH = str(BASE_DIR / ".cache" / "market_data.sqlite3")
DATA_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS
DATA_CACHE_MAX_ENTRIES = CACHE_MAX_ENTRIES

# Market-data vendor order. The router tries vendors from left to right and
# falls back when a provider errors or returns an empty/unusable payload.
DATA_VENDOR_CORE_STOCK_APIS = env("DATA_VENDOR_CORE_STOCK_APIS", "yfinance,alpha_vantage")
DATA_VENDOR_TECHNICAL_INDICATORS = env("DATA_VENDOR_TECHNICAL_INDICATORS", "yfinance,alpha_vantage")
DATA_VENDOR_FUNDAMENTAL_DATA = env("DATA_VENDOR_FUNDAMENTAL_DATA", "yfinance,alpha_vantage")
DATA_VENDOR_NEWS_DATA = env("DATA_VENDOR_NEWS_DATA", "yfinance,alpha_vantage")

# Circuit breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
CIRCUIT_BREAKER_RECOVERY_SECONDS = 60

# Tool
TOOL_TIMEOUT_SECONDS = env_int("TOOL_TIMEOUT_SECONDS", 45, min_value=1)
TOOL_MAX_RETRIES = env_int("TOOL_MAX_RETRIES", 2, min_value=1)

# Debate
DEBATE_MIN_ROUNDS = 2
DEBATE_CONFIDENCE_GAP = 0.18
DEBATE_CONSENSUS_THRESHOLD = 0.72
RISK_MIN_ROUNDS = 2
RISK_CONSENSUS_THRESHOLD = 0.72
ADAPTIVE_DEBATE_ENABLED = True
