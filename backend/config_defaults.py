"""Non-secret backend settings and operational defaults."""

from __future__ import annotations

import logging
import os

from config_env import BASE_DIR, env, env_bool, env_float, env_int

logger = logging.getLogger("config")

# App
APP_NAME = "TradingAgents API"
APP_ENV = env("APP_ENV", "development").lower().strip()

if APP_ENV not in {"development", "production"}:
    raise ValueError(f"Invalid APP_ENV={APP_ENV!r}. Allowed values: development, production.")

IS_PRODUCTION = APP_ENV == "production"
IS_DEVELOPMENT = APP_ENV == "development"
_IS_PRODUCTION = IS_PRODUCTION

# Ports
BACKEND_PORT = 8000
FRONTEND_PORT = 3000

# CORS. Development gets an explicit local allowlist when CORS_ORIGINS is empty.
# Production must opt in to allowed frontend origins explicitly.
DEFAULT_DEV_CORS_ORIGINS: list[str] = [
    f"http://localhost:{FRONTEND_PORT}",
    "http://localhost:5173",
    f"http://127.0.0.1:{FRONTEND_PORT}",
    "http://127.0.0.1:5173",
]

_raw_cors_origins = env("CORS_ORIGINS", "")
if _raw_cors_origins.strip():
    CORS_ORIGINS: list[str] = [origin.strip() for origin in _raw_cors_origins.split(",") if origin.strip()]
elif IS_DEVELOPMENT:
    CORS_ORIGINS = list(DEFAULT_DEV_CORS_ORIGINS)
else:
    CORS_ORIGINS = []

if "*" in CORS_ORIGINS:
    raise ValueError("CORS_ORIGINS='*' is not allowed. Use explicit origins instead.")

if IS_PRODUCTION and not CORS_ORIGINS:
    raise ValueError("CORS_ORIGINS must be explicitly configured in production.")

API_KEY = env("API_KEY", "")
if IS_PRODUCTION and not API_KEY:
    raise ValueError("API_KEY must be configured in production.")

# Pipeline tunables
PIPELINE_TIMEOUT_SECONDS = env_int("PIPELINE_TIMEOUT_SECONDS", 600, min_value=1)
PREFLIGHT_TIMEOUT_SECONDS = min(env_int("PREFLIGHT_TIMEOUT_SECONDS", 30, min_value=1), PIPELINE_TIMEOUT_SECONDS)
PROCESS_POOL_WORKERS = min(env_int("PROCESS_POOL_WORKERS", 2, min_value=1), os.cpu_count() or 2)
PROCESS_POOL_MAX_TASKS_PER_CHILD = env_int("PROCESS_POOL_MAX_TASKS_PER_CHILD", 1, min_value=1)
DATA_COLLECTION_WORKERS = env_int("DATA_COLLECTION_WORKERS", 3, min_value=1)
ANALYST_PARALLEL_WORKERS = env_int("ANALYST_PARALLEL_WORKERS", 3, min_value=1)
DEFAULT_MAX_DEBATE_ROUNDS = env_int("DEFAULT_MAX_DEBATE_ROUNDS", 3, min_value=1)
MAX_RISK_DISCUSS_ROUNDS = 1
ANALYSIS_MODE = "balanced"
DEFAULT_ANALYSIS_DEPTH = "balanced"
ANALYSIS_DEPTHS: tuple[str, ...] = ("fast", "balanced", "deep")
RESPONSE_DETAILS: tuple[str, ...] = ("summary", "full", "debug")

# Analysis depth controls both the LLM budget and the intended debate depth.
# Fast skips debate/risk committee, balanced runs the standard flow, and deep
# has enough budget for extra debate/risk passes when the pipeline supports them.
ANALYSIS_DEPTH_CONFIG: dict[str, dict[str, int]] = {
    "fast": {
        "llm_budget": 6,
        "llm_retries": 1,
        "debate_rounds": 1,
        "risk_rounds": 1,
    },
    "balanced": {
        "llm_budget": 9,
        "llm_retries": 2,
        "debate_rounds": 2,
        "risk_rounds": 2,
    },
    "deep": {
        "llm_budget": 12,
        "llm_retries": 3,
        "debate_rounds": 3,
        "risk_rounds": 3,
    },
}
ANALYSIS_DEPTH_LLM_BUDGETS: dict[str, int] = {depth: cfg["llm_budget"] for depth, cfg in ANALYSIS_DEPTH_CONFIG.items()}
MAX_GEMINI_CALLS = ANALYSIS_DEPTH_LLM_BUDGETS[DEFAULT_ANALYSIS_DEPTH]

# Rate limiting
REQUEST_RATE_LIMIT_PER_MINUTE = env_int("REQUEST_RATE_LIMIT_PER_MINUTE", 20, min_value=1)
STREAM_RATE_LIMIT_PER_MINUTE = env_int("STREAM_RATE_LIMIT_PER_MINUTE", 8, min_value=1)
MAX_CONCURRENT_REQUESTS_PER_KEY = env_int("MAX_CONCURRENT_REQUESTS_PER_KEY", 2, min_value=1)
MAX_CONCURRENT_STREAMS_PER_KEY = env_int("MAX_CONCURRENT_STREAMS_PER_KEY", 1, min_value=1)
REQUEST_BODY_MAX_BYTES = env_int("REQUEST_BODY_MAX_BYTES", 64 * 1024, min_value=1024)
REQUIRE_API_KEY_FOR_RATE_LIMIT = env_bool("REQUIRE_API_KEY_FOR_RATE_LIMIT", IS_PRODUCTION)
if IS_PRODUCTION and not REQUIRE_API_KEY_FOR_RATE_LIMIT:
    logger.warning(
        "APP_ENV=production but REQUIRE_API_KEY_FOR_RATE_LIMIT is disabled; "
        "proxy requests without an API key will be accepted. Browser owner tokens are still required."
    )

# LLM resilience
LLM_TIMEOUT_SECONDS = env_int("LLM_TIMEOUT_SECONDS", 60, min_value=1)
LLM_MAX_RETRIES = env_int("LLM_MAX_RETRIES", 2, min_value=1)
PROVIDER_SDK_MAX_RETRIES = env_int("PROVIDER_SDK_MAX_RETRIES", 0, min_value=0)
LLM_RETRIES_BY_DEPTH: dict[str, int] = {depth: cfg["llm_retries"] for depth, cfg in ANALYSIS_DEPTH_CONFIG.items()}
LLM_RETRY_BASE_DELAY = 1.5
LLM_RETRY_MAX_DELAY = 30
LLM_429_MAX_WAIT_SECONDS = 20
MAX_CONCURRENT_LLM_CALLS = 3

# Cache
CACHE_TTL_SECONDS = env_int("CACHE_TTL_SECONDS", 900, min_value=1)
CACHE_MAX_ENTRIES = env_int("CACHE_MAX_ENTRIES", 512, min_value=1)
ANALYSIS_RESULT_CACHE_TTL_SECONDS = env_int("ANALYSIS_RESULT_CACHE_TTL_SECONDS", 60 * 60 * 8, min_value=60)
ANALYSIS_RESULT_CACHE_MAX_ENTRIES = env_int("ANALYSIS_RESULT_CACHE_MAX_ENTRIES", 256, min_value=1)
ANALYSIS_JOB_TTL_SECONDS = env_int("ANALYSIS_JOB_TTL_SECONDS", 60 * 60 * 8, min_value=60)
ANALYSIS_JOB_MAX_ENTRIES = env_int("ANALYSIS_JOB_MAX_ENTRIES", 256, min_value=1)
ANALYSIS_JOB_MAX_ACTIVE = min(env_int("ANALYSIS_JOB_MAX_ACTIVE", 32, min_value=1), ANALYSIS_JOB_MAX_ENTRIES)
ANALYSIS_JOB_EVENT_REPLAY_LIMIT = env_int("ANALYSIS_JOB_EVENT_REPLAY_LIMIT", 500, min_value=1)
ANALYSIS_JOB_CACHE_DB_PATH = env(
    "ANALYSIS_JOB_CACHE_DB_PATH",
    str(BASE_DIR / ".cache" / "analysis_jobs.sqlite3"),
)
OWNER_SESSION_SECRET = env("OWNER_SESSION_SECRET", "")
if IS_PRODUCTION and not OWNER_SESSION_SECRET:
    raise ValueError("OWNER_SESSION_SECRET must be configured in production.")
OWNER_SESSION_TTL_SECONDS = env_int("OWNER_SESSION_TTL_SECONDS", ANALYSIS_JOB_TTL_SECONDS, min_value=60)
DATA_CACHE_BACKEND = "sqlite"
DATA_CACHE_DB_PATH = env(
    "DATA_CACHE_DB_PATH",
    str(BASE_DIR / ".cache" / "market_data.sqlite3"),
)
DATA_CACHE_TTL_SECONDS = env_int("DATA_CACHE_TTL_SECONDS", CACHE_TTL_SECONDS, min_value=1)
DATA_CACHE_MAX_ENTRIES = env_int("DATA_CACHE_MAX_ENTRIES", CACHE_MAX_ENTRIES, min_value=1)

# Market-data vendor order. The router tries vendors from left to right and
# falls back when a provider errors or returns an empty/unusable payload.
DATA_VENDOR_CORE_STOCK_APIS = env("DATA_VENDOR_CORE_STOCK_APIS", "yfinance,alpha_vantage")
DATA_VENDOR_TECHNICAL_INDICATORS = env("DATA_VENDOR_TECHNICAL_INDICATORS", "yfinance,alpha_vantage")
DATA_VENDOR_FUNDAMENTAL_DATA = env("DATA_VENDOR_FUNDAMENTAL_DATA", "yfinance,alpha_vantage")
DATA_VENDOR_NEWS_DATA = env("DATA_VENDOR_NEWS_DATA", "marketaux,newsdata,yfinance,alpha_vantage")
DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE = env_float(
    "DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE",
    0.35,
    min_value=0,
    max_value=1,
)

# Structured news providers
MARKETAUX_API_KEY = env("MARKETAUX_API_KEY", "")
NEWSDATA_API_KEY = env("NEWSDATA_API_KEY", "")
NEWS_PROVIDER_PRIORITY = env("NEWS_PROVIDER_PRIORITY", "marketaux,newsdata")
NEWS_ENABLED_PROVIDERS = env("NEWS_ENABLED_PROVIDERS", "marketaux,newsdata")
NEWS_DEFAULT_WINDOW_DAYS = env_int("NEWS_DEFAULT_WINDOW_DAYS", 30, min_value=1)
NEWS_MAX_ARTICLES_PER_PROVIDER = env_int("NEWS_MAX_ARTICLES_PER_PROVIDER", 10, min_value=1)
NEWS_MAX_ARTICLES_FOR_PROMPT = env_int("NEWS_MAX_ARTICLES_FOR_PROMPT", 5, min_value=1)
NEWS_MAX_ARTICLES_FOR_UI = env_int("NEWS_MAX_ARTICLES_FOR_UI", 20, min_value=1)
NEWS_MIN_RELEVANCE_SCORE = env_int("NEWS_MIN_RELEVANCE_SCORE", 50, min_value=0)
NEWS_PROMPT_MIN_RELEVANCE_SCORE = env_int("NEWS_PROMPT_MIN_RELEVANCE_SCORE", 65, min_value=0)
NEWS_CACHE_ENABLED = env_bool("NEWS_CACHE_ENABLED", True)
NEWS_CACHE_TTL_MINUTES = env_int("NEWS_CACHE_TTL_MINUTES", 360, min_value=1)
NEWS_CACHE_DB_PATH = env("NEWS_CACHE_DB_PATH", str(BASE_DIR / ".cache" / "news_data.sqlite3"))
NEWS_CACHE_MAX_ENTRIES = env_int("NEWS_CACHE_MAX_ENTRIES", 512, min_value=1)
NEWS_DEBUG_RAW_RESPONSE = env_bool("NEWS_DEBUG_RAW_RESPONSE", False)
NEWS_LOG_PROVIDER_REQUESTS = env_bool("NEWS_LOG_PROVIDER_REQUESTS", True)
NEWS_VENDOR_TIMEOUT_SECONDS = env_int("NEWS_VENDOR_TIMEOUT_SECONDS", 15, min_value=1)
NEWS_VENDOR_MAX_RETRIES = env_int("NEWS_VENDOR_MAX_RETRIES", 2, min_value=0)
NEWS_FETCH_SECONDARY_ALWAYS = env_bool("NEWS_FETCH_SECONDARY_ALWAYS", False)
NEWS_SECONDARY_FETCH_THRESHOLD = env_int("NEWS_SECONDARY_FETCH_THRESHOLD", 5, min_value=1)
NEWS_ENABLE_YFINANCE_FALLBACK = env_bool("NEWS_ENABLE_YFINANCE_FALLBACK", True)

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
