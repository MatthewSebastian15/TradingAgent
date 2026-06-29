"""Non-secret backend settings and operational defaults."""

from __future__ import annotations

from pathlib import Path

from config_env import env, env_bool, env_float, env_int, env_list

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

# CORS
DEFAULT_DEV_CORS_ORIGINS: list[str] = [
    f"http://localhost:{FRONTEND_PORT}",
    "http://localhost:5173",
    f"http://127.0.0.1:{FRONTEND_PORT}",
    "http://127.0.0.1:5173",
]
CORS_ORIGINS: list[str] = env_list(
    "CORS_ORIGINS", [] if IS_PRODUCTION else DEFAULT_DEV_CORS_ORIGINS
)

if "*" in CORS_ORIGINS:
    raise ValueError("CORS_ORIGINS='*' is not allowed. Use explicit origins instead.")

if IS_PRODUCTION and not CORS_ORIGINS:
    raise ValueError("CORS_ORIGINS must be explicitly configured in production.")

API_KEY = env("API_KEY", "")
if IS_PRODUCTION and not API_KEY:
    raise ValueError("API_KEY must be configured in production.")

# Pipeline tunables
PIPELINE_TOTAL_TIMEOUT_SECONDS = env_int(
    "PIPELINE_TOTAL_TIMEOUT_SECONDS",
    env_int("PIPELINE_TIMEOUT_SECONDS", 600, min_value=1),
    min_value=1,
)
PIPELINE_TIMEOUT_SECONDS = PIPELINE_TOTAL_TIMEOUT_SECONDS
PIPELINE_STAGE_TIMEOUT_SECONDS = env_int("PIPELINE_STAGE_TIMEOUT_SECONDS", 30, min_value=1)
PIPELINE_LLM_CALL_TIMEOUT_SECONDS = env_int("PIPELINE_LLM_CALL_TIMEOUT_SECONDS", 45, min_value=1)
PREFLIGHT_TIMEOUT_SECONDS = min(
    env_int("PREFLIGHT_TIMEOUT_SECONDS", 30, min_value=1), PIPELINE_TIMEOUT_SECONDS
)
PROCESS_POOL_WORKERS = env_int("PROCESS_POOL_WORKERS", 2, min_value=1)
PROCESS_POOL_MAX_TASKS_PER_CHILD = env_int("PROCESS_POOL_MAX_TASKS_PER_CHILD", 1, min_value=1)
DATA_COLLECTION_WORKERS = env_int("DATA_COLLECTION_WORKERS", 12, min_value=1)
PRICE_MAX_FALLBACK_DAYS = env_int("PRICE_MAX_FALLBACK_DAYS", 7, min_value=0)

# Annual risk-free rate (as a fraction, e.g. 0.04 = 4%) used by the Quant tab's
# Sharpe/Sortino. Exposed to the browser via GET /api/status. Default 0 keeps the
# v1 "excess over 0%" behavior.
QUANT_RISK_FREE_RATE = env_float("QUANT_RISK_FREE_RATE", 0.0, min_value=0.0, max_value=1.0)
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
LLM_BUDGET_BY_ANALYSIS_DEPTH: dict[str, dict[str, int]] = {
    "fast": {
        "max_total_llm_calls": env_int("LLM_BUDGET_FAST", 6, min_value=0),
    },
    "balanced": {
        "max_total_llm_calls": env_int("LLM_BUDGET_BALANCED", 9, min_value=0),
    },
    "deep": {
        "max_total_llm_calls": env_int("LLM_BUDGET_DEEP", 12, min_value=0),
    },
}
ANALYSIS_DEPTH_CONFIG: dict[str, dict[str, int]] = {
    "fast": {
        "llm_budget": LLM_BUDGET_BY_ANALYSIS_DEPTH["fast"]["max_total_llm_calls"],
        "llm_retries": 1,
        "debate_rounds": 1,
        "risk_rounds": 1,
    },
    "balanced": {
        "llm_budget": LLM_BUDGET_BY_ANALYSIS_DEPTH["balanced"]["max_total_llm_calls"],
        "llm_retries": 2,
        "debate_rounds": 2,
        "risk_rounds": 2,
    },
    "deep": {
        "llm_budget": LLM_BUDGET_BY_ANALYSIS_DEPTH["deep"]["max_total_llm_calls"],
        "llm_retries": 3,
        "debate_rounds": 3,
        "risk_rounds": 3,
    },
}
ANALYSIS_DEPTH_LLM_BUDGETS: dict[str, int] = {
    depth: cfg["llm_budget"] for depth, cfg in ANALYSIS_DEPTH_CONFIG.items()
}
MAX_GEMINI_CALLS = ANALYSIS_DEPTH_LLM_BUDGETS[DEFAULT_ANALYSIS_DEPTH]

# Rate limiting
REQUEST_RATE_LIMIT_PER_MINUTE = env_int("REQUEST_RATE_LIMIT_PER_MINUTE", 20, min_value=1)
STATUS_RATE_LIMIT_PER_MINUTE = env_int("STATUS_RATE_LIMIT_PER_MINUTE", 120, min_value=1)
STREAM_RATE_LIMIT_PER_MINUTE = env_int("STREAM_RATE_LIMIT_PER_MINUTE", 8, min_value=1)
MAX_CONCURRENT_REQUESTS_PER_KEY = env_int("MAX_CONCURRENT_REQUESTS_PER_KEY", 2, min_value=1)
MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY = env_int(
    "MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY", 8, min_value=1
)
MAX_CONCURRENT_STREAMS_PER_KEY = env_int("MAX_CONCURRENT_STREAMS_PER_KEY", 1, min_value=1)
REQUEST_BODY_MAX_BYTES = env_int("REQUEST_BODY_MAX_BYTES", 16 * 1024 * 1024, min_value=1024)
REQUIRE_API_KEY_FOR_RATE_LIMIT = env_bool("REQUIRE_API_KEY_FOR_RATE_LIMIT", IS_PRODUCTION)
if IS_PRODUCTION and not REQUIRE_API_KEY_FOR_RATE_LIMIT:
    raise ValueError("REQUIRE_API_KEY_FOR_RATE_LIMIT=false is not allowed in production.")

RATE_LIMIT_STORAGE_BACKEND = env("RATE_LIMIT_STORAGE_BACKEND", "sqlite").lower().strip()
if RATE_LIMIT_STORAGE_BACKEND not in {"memory", "sqlite"}:
    raise ValueError("RATE_LIMIT_STORAGE_BACKEND must be one of: memory, sqlite.")
if IS_PRODUCTION and RATE_LIMIT_STORAGE_BACKEND == "memory":
    raise ValueError("RATE_LIMIT_STORAGE_BACKEND=memory is not allowed in production.")
RATE_LIMIT_DB_PATH = Path(env("RATE_LIMIT_DB_PATH", ".cache/rate_limits.sqlite3"))

# LLM resilience
LLM_TIMEOUT_SECONDS = env_int("LLM_TIMEOUT_SECONDS", 60, min_value=1)
LLM_MAX_RETRIES = env_int("LLM_MAX_RETRIES", 1, min_value=1)
PROVIDER_SDK_MAX_RETRIES = env_int("PROVIDER_SDK_MAX_RETRIES", 0, min_value=0)
LLM_RETRIES_BY_DEPTH: dict[str, int] = {
    depth: cfg["llm_retries"] for depth, cfg in ANALYSIS_DEPTH_CONFIG.items()
}
LLM_RETRY_BASE_DELAY = 1.5
LLM_RETRY_MAX_DELAY = 30
LLM_429_MAX_WAIT_SECONDS = 20
MAX_CONCURRENT_LLM_CALLS = 3

# Cache
CACHE_TTL_SECONDS = env_int("CACHE_TTL_SECONDS", 900, min_value=1)
CACHE_MAX_ENTRIES = env_int("CACHE_MAX_ENTRIES", 512, min_value=1)
PRICE_CACHE_TTL_SECONDS = env_int("PRICE_CACHE_TTL_SECONDS", 90, min_value=1)
LLM_EXACT_CACHE_ENABLED = env_bool("LLM_EXACT_CACHE_ENABLED", True)
LLM_EXACT_CACHE_TTL_SECONDS = env_int("LLM_EXACT_CACHE_TTL_SECONDS", 1800, min_value=60)
LLM_EXACT_CACHE_MAX_ENTRIES = env_int("LLM_EXACT_CACHE_MAX_ENTRIES", 1024, min_value=1)
LLM_EXACT_CACHE_DB_PATH = env("LLM_EXACT_CACHE_DB_PATH", ".cache/llm_exact_cache.sqlite3")
LLM_SEMANTIC_CACHE_ENABLED = env_bool("LLM_SEMANTIC_CACHE_ENABLED", False)
LLM_SEMANTIC_CACHE_TTL_SECONDS = env_int("LLM_SEMANTIC_CACHE_TTL_SECONDS", 3600, min_value=60)
LLM_SEMANTIC_CACHE_MAX_ENTRIES = env_int("LLM_SEMANTIC_CACHE_MAX_ENTRIES", 2048, min_value=1)
LLM_SEMANTIC_CACHE_DB_PATH = env("LLM_SEMANTIC_CACHE_DB_PATH", ".cache/llm_semantic_cache.sqlite3")
LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD = env_float(
    "LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD",
    0.97,
    min_value=0.0,
    max_value=1.0,
)
LLM_SEMANTIC_CACHE_TARGETS = env("LLM_SEMANTIC_CACHE_TARGETS", "news_summary,company_profile")
ANALYSIS_RESULT_CACHE_TTL_SECONDS = env_int(
    "ANALYSIS_RESULT_CACHE_TTL_SECONDS", 60 * 60 * 8, min_value=60
)
ANALYSIS_RESULT_CACHE_MAX_ENTRIES = env_int("ANALYSIS_RESULT_CACHE_MAX_ENTRIES", 256, min_value=1)
ANALYSIS_JOB_TTL_SECONDS = env_int("ANALYSIS_JOB_TTL_SECONDS", 60 * 60 * 8, min_value=60)
ANALYSIS_JOB_MAX_ENTRIES = env_int("ANALYSIS_JOB_MAX_ENTRIES", 256, min_value=1)
ANALYSIS_JOB_MAX_ACTIVE = min(
    env_int("ANALYSIS_JOB_MAX_ACTIVE", 32, min_value=1), ANALYSIS_JOB_MAX_ENTRIES
)
ANALYSIS_JOB_EVENT_REPLAY_LIMIT = env_int("ANALYSIS_JOB_EVENT_REPLAY_LIMIT", 500, min_value=1)
ANALYSIS_JOB_CACHE_DB_PATH = env("ANALYSIS_JOB_CACHE_DB_PATH", ".cache/analysis_jobs.sqlite3")
ANALYSIS_JOB_STORE_BACKEND = env("ANALYSIS_JOB_STORE_BACKEND", "sqlite").lower().strip()
if ANALYSIS_JOB_STORE_BACKEND not in {"sqlite"}:
    raise ValueError("ANALYSIS_JOB_STORE_BACKEND must be sqlite.")
ANALYSIS_JOB_ROUTING_MODE = env("ANALYSIS_JOB_ROUTING_MODE", "sticky_sessions").lower().strip()
if ANALYSIS_JOB_ROUTING_MODE not in {"single_instance", "sticky_sessions"}:
    raise ValueError("ANALYSIS_JOB_ROUTING_MODE must be one of: single_instance, sticky_sessions.")
ANALYSIS_DB_PATH = env("ANALYSIS_DB_PATH", ".cache/analysis_history.sqlite3")
ANALYSIS_STORAGE_BACKEND = env("ANALYSIS_STORAGE_BACKEND", "sqlite").lower().strip()
if ANALYSIS_STORAGE_BACKEND not in {"sqlite", "postgres"}:
    raise ValueError("ANALYSIS_STORAGE_BACKEND must be one of: sqlite, postgres.")
ANALYSIS_DATABASE_URL = env("ANALYSIS_DATABASE_URL", "")
if ANALYSIS_STORAGE_BACKEND == "postgres":
    if not ANALYSIS_DATABASE_URL:
        raise ValueError(
            "ANALYSIS_DATABASE_URL is required when ANALYSIS_STORAGE_BACKEND=postgres."
        )
    if "change-me" in ANALYSIS_DATABASE_URL or env("POSTGRES_PASSWORD", "") == "change-me":
        raise ValueError(
            "Default 'change-me' credential is not allowed. Generate one: openssl rand -hex 16."
        )
ANALYSIS_HISTORY_MAX_ROWS = env_int("ANALYSIS_HISTORY_MAX_ROWS", 1000, min_value=1)
ANALYSIS_HISTORY_DEFAULT_LIMIT = env_int("ANALYSIS_HISTORY_DEFAULT_LIMIT", 25, min_value=1)
OWNER_SESSION_SECRET = env("OWNER_SESSION_SECRET", "")
if IS_PRODUCTION and not OWNER_SESSION_SECRET:
    raise ValueError("OWNER_SESSION_SECRET must be configured in production.")
OWNER_SESSION_TTL_SECONDS = env_int(
    "OWNER_SESSION_TTL_SECONDS", ANALYSIS_JOB_TTL_SECONDS, min_value=60
)
DATA_CACHE_BACKEND = env("DATA_CACHE_BACKEND", "sqlite").lower().strip()
if DATA_CACHE_BACKEND not in {"sqlite"}:
    raise ValueError("DATA_CACHE_BACKEND must be sqlite.")
DATA_CACHE_DB_PATH = env("DATA_CACHE_DB_PATH", ".cache/market_data.sqlite3")
DATA_CACHE_TTL_SECONDS = env_int("DATA_CACHE_TTL_SECONDS", CACHE_TTL_SECONDS, min_value=1)
DATA_CACHE_MAX_ENTRIES = env_int("DATA_CACHE_MAX_ENTRIES", CACHE_MAX_ENTRIES, min_value=1)

# Market-data vendor order. The router tries vendors from left to right and
# falls back when a provider errors or returns an empty/unusable payload.
DATA_VENDOR_CORE_STOCK_APIS = env("DATA_VENDOR_CORE_STOCK_APIS", "yfinance,finnhub,alpha_vantage")
DATA_VENDOR_TECHNICAL_INDICATORS = env(
    "DATA_VENDOR_TECHNICAL_INDICATORS", "yfinance,finnhub,alpha_vantage"
)
DATA_VENDOR_FUNDAMENTAL_DATA = env("DATA_VENDOR_FUNDAMENTAL_DATA", "yfinance,finnhub,alpha_vantage")
DATA_VENDOR_NEWS_DATA = env(
    "DATA_VENDOR_NEWS_DATA", "google_news_light,marketaux,newsdata,yfinance,finnhub,alpha_vantage"
)
DATA_VENDOR_QUOTE_DATA = env("DATA_VENDOR_QUOTE_DATA", "yfinance,finnhub,alpha_vantage")
DATA_VENDOR_FINANCIAL_STATEMENTS = env(
    "DATA_VENDOR_FINANCIAL_STATEMENTS", "yfinance,sec_companyfacts,alpha_vantage,finnhub"
)
DATA_VENDOR_GLOBAL_NEWS_DATA = env("DATA_VENDOR_GLOBAL_NEWS_DATA", "finnhub,alpha_vantage,yfinance")
DATA_VENDOR_SENTIMENT_DATA = env("DATA_VENDOR_SENTIMENT_DATA", "finnhub,alpha_vantage")
DATA_VENDOR_SOCIAL_SENTIMENT = env("DATA_VENDOR_SOCIAL_SENTIMENT", "finnhub")
DATA_VENDOR_EVENT_DATA = env("DATA_VENDOR_EVENT_DATA", "finnhub")
DATA_VENDOR_ANALYST_RATING = env("DATA_VENDOR_ANALYST_RATING", "finnhub")
DATA_VENDOR_INSIDER_DATA = env("DATA_VENDOR_INSIDER_DATA", "finnhub,alpha_vantage,yfinance")
DATA_VENDOR_FOREX_DATA = env("DATA_VENDOR_FOREX_DATA", "finnhub,alpha_vantage")
DATA_VENDOR_CRYPTO_DATA = env("DATA_VENDOR_CRYPTO_DATA", "finnhub,alpha_vantage")
DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE = env_float(
    "DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE",
    0.35,
    min_value=0,
    max_value=1,
)
DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS = env_bool("DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS", True)
DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE = env_bool("DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE", False)
DATA_VENDOR_ENABLE_FINNHUB_FALLBACK = env_bool("DATA_VENDOR_ENABLE_FINNHUB_FALLBACK", True)
DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT = env_bool("DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT", True)
DATA_VENDOR_REQUIRE_SOURCE_METADATA = env_bool("DATA_VENDOR_REQUIRE_SOURCE_METADATA", True)
DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE = env_bool("DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE", True)
DATA_VENDOR_MAX_CALLS_PER_ANALYSIS = env_int("DATA_VENDOR_MAX_CALLS_PER_ANALYSIS", 60, min_value=0)


# Structured news providers
GOOGLE_NEWS_LIGHT_API_KEY = env("GOOGLE_NEWS_LIGHT_API_KEY", "")
MARKETAUX_API_KEY = env("MARKETAUX_API_KEY", "")
NEWSDATA_API_KEY = env("NEWSDATA_API_KEY", "")
FINNHUB_API_KEY = env("FINNHUB_API_KEY", "")
# Economic tab — WTO is the only source needing a key (free registration). Empty
# => the Trade tab hides the WTO panel.
ECONOMIC_WTO_API_KEY = env("ECONOMIC_WTO_API_KEY", "")
ALPHA_VANTAGE_API_KEY = env("ALPHA_VANTAGE_API_KEY", "")
NEWS_STRICT_AI_ANALYSIS_MODE = env_bool("NEWS_STRICT_AI_ANALYSIS_MODE", True)
NEWS_FORCE_ALL_PROVIDERS = env_bool("NEWS_FORCE_ALL_PROVIDERS", False)
NEWS_PROVIDER_PRIORITY: list[str] = env_list(
    "NEWS_PROVIDER_PRIORITY",
    ["google_news_light", "marketaux", "rss_context", "newsdata", "yfinance"],
)
NEWS_ENABLED_PROVIDERS: list[str] = env_list(
    "NEWS_ENABLED_PROVIDERS",
    ["google_news_light", "marketaux", "rss_context", "newsdata", "yfinance"],
)
NEWS_DEFAULT_WINDOW_DAYS = env_int("NEWS_DEFAULT_WINDOW_DAYS", 30, min_value=1)
NEWS_MAX_ARTICLES_PER_PROVIDER = env_int("NEWS_MAX_ARTICLES_PER_PROVIDER", 20, min_value=1)
NEWS_MAX_ARTICLES_FOR_PROMPT = env_int("NEWS_MAX_ARTICLES_FOR_PROMPT", 5, min_value=1)
NEWS_MAX_ARTICLES_FOR_UI = env_int("NEWS_MAX_ARTICLES_FOR_UI", 30, min_value=1)
NEWS_MIN_RELEVANCE_SCORE = env_int("NEWS_MIN_RELEVANCE_SCORE", 55, min_value=0)
NEWS_PROMPT_MIN_RELEVANCE_SCORE = env_int("NEWS_PROMPT_MIN_RELEVANCE_SCORE", 70, min_value=0)
NEWS_DECISION_MIN_RELEVANCE_SCORE = env_float(
    "NEWS_DECISION_MIN_RELEVANCE_SCORE", 70, min_value=0, max_value=100
)
NEWS_RSS_DECISION_MIN_RELEVANCE_SCORE = env_float(
    "NEWS_RSS_DECISION_MIN_RELEVANCE_SCORE",
    80,
    min_value=0,
    max_value=100,
)
# Hardcoded RSS settings keep the news pipeline active without requiring .env values.
NEWS_RSS_ENABLED = True
NEWS_RSS_MAX_FEEDS = 50
NEWS_RSS_MAX_ITEMS_PER_FEED = 20
NEWS_RSS_INCLUDE_TRIAL_FEEDS = True
NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED = True
NEWS_RSS_ENABLED_FEED_IDS = ""
NEWS_RSS_DISABLED_FEED_IDS: list[str] = []
NEWS_RSS_USER_AGENT = "TradingAgent/0.1 RSS Reader"
NEWS_CACHE_ENABLED = env_bool("NEWS_CACHE_ENABLED", True)
NEWS_CACHE_TTL_MINUTES = env_int("NEWS_CACHE_TTL_MINUTES", 60, min_value=1)
# Ticker-scoped news cache used by the per-ticker news UI. Distinct from
# general_news.sqlite3 below, which is the standalone article store feeding the
# RAG chatbot news pool (services/rag_pool.py). Keep the two separate.
NEWS_CACHE_DB_PATH = ".cache/news_data.sqlite3"
NEWS_CACHE_MAX_ENTRIES = env_int("NEWS_CACHE_MAX_ENTRIES", 512, min_value=1)
NEWS_DEBUG_RAW_RESPONSE = env_bool("NEWS_DEBUG_RAW_RESPONSE", False)
NEWS_LOG_PROVIDER_REQUESTS = env_bool("NEWS_LOG_PROVIDER_REQUESTS", True)
NEWS_VENDOR_TIMEOUT_SECONDS = env_int("NEWS_VENDOR_TIMEOUT_SECONDS", 10, min_value=1)
NEWS_VENDOR_MAX_RETRIES = env_int("NEWS_VENDOR_MAX_RETRIES", 1, min_value=0)
NEWS_FETCH_SECONDARY_ALWAYS = env_bool("NEWS_FETCH_SECONDARY_ALWAYS", True)
NEWS_SECONDARY_FETCH_THRESHOLD = env_int("NEWS_SECONDARY_FETCH_THRESHOLD", 3, min_value=1)
NEWS_ENABLE_YFINANCE_FALLBACK = env_bool("NEWS_ENABLE_YFINANCE_FALLBACK", True)

# General News Tab
GENERAL_NEWS_ENABLED = env_bool("GENERAL_NEWS_ENABLED", True)
GENERAL_NEWS_PROVIDER_PRIORITY: list[str] = env_list(
    "GENERAL_NEWS_PROVIDER_PRIORITY",
    ["rss_context", "google_news_light", "marketaux", "newsdata"],
)
GENERAL_NEWS_ENABLED_PROVIDERS: list[str] = env_list(
    "GENERAL_NEWS_ENABLED_PROVIDERS",
    ["rss_context", "google_news_light", "marketaux", "newsdata"],
)

GENERAL_NEWS_ENABLE_BACKGROUND_REFRESH = env_bool("GENERAL_NEWS_ENABLE_BACKGROUND_REFRESH", True)
GENERAL_NEWS_REFRESH_INTERVAL_SECONDS = env_int(
    "NEWS_BACKGROUND_REFRESH_SECONDS",
    env_int("GENERAL_NEWS_REFRESH_INTERVAL_SECONDS", 300, min_value=30),
    min_value=30,
)
GENERAL_NEWS_CACHE_TTL_SECONDS = env_int(
    "NEWS_GENERAL_CACHE_TTL_SECONDS",
    env_int("GENERAL_NEWS_CACHE_TTL_SECONDS", 300, min_value=30),
    min_value=30,
)
GENERAL_NEWS_STALE_TTL_SECONDS = env_int("NEWS_GENERAL_STALE_TTL_SECONDS", 3600, min_value=30)
NEWS_BACKGROUND_REFRESH_SECONDS = GENERAL_NEWS_REFRESH_INTERVAL_SECONDS
NEWS_RSS_MAX_CONCURRENCY = env_int("NEWS_RSS_MAX_CONCURRENCY", 5, min_value=1)
NEWS_PROVIDER_MAX_CONCURRENCY = env_int("NEWS_PROVIDER_MAX_CONCURRENCY", 4, min_value=1)
NEWS_MANUAL_REFRESH_COOLDOWN_SECONDS = env_int(
    "NEWS_MANUAL_REFRESH_COOLDOWN_SECONDS", 90, min_value=1
)
NEWS_PROVIDER_429_COOLDOWN_SECONDS = env_int(
    "NEWS_PROVIDER_429_COOLDOWN_SECONDS", 1800, min_value=1
)
NEWS_RSS_ROTATION_BATCH_SIZE = env_int("NEWS_RSS_ROTATION_BATCH_SIZE", 20, min_value=1)
NEWS_MAX_STORED_ARTICLES = env_int("NEWS_MAX_STORED_ARTICLES", 2000, min_value=1)
NEWS_ARTICLE_RETENTION_DAYS = env_int("NEWS_ARTICLE_RETENTION_DAYS", 30, min_value=1)
# ponytail: 2000 = NEWS_MAX_STORED_ARTICLES ceiling; raise the store cap too if you need more.
NEWS_UI_DEFAULT_LIMIT = env_int("NEWS_UI_DEFAULT_LIMIT", 2000, min_value=1)
NEWS_FORCE_REFRESH_ALLOWED = env_bool("NEWS_FORCE_REFRESH_ALLOWED", False)
GENERAL_NEWS_FRONTEND_POLL_SECONDS = env_int("GENERAL_NEWS_FRONTEND_POLL_SECONDS", 60, min_value=10)
GENERAL_NEWS_ENABLE_SSE = env_bool("GENERAL_NEWS_ENABLE_SSE", True)

GENERAL_NEWS_DEFAULT_WINDOW_DAYS = env_int("GENERAL_NEWS_DEFAULT_WINDOW_DAYS", 14, min_value=1)
GENERAL_NEWS_MAX_ARTICLES_PER_PROVIDER = env_int(
    "GENERAL_NEWS_MAX_ARTICLES_PER_PROVIDER", 30, min_value=1
)
GENERAL_NEWS_MAX_ARTICLES_FOR_UI = env_int("GENERAL_NEWS_MAX_ARTICLES_FOR_UI", 2000, min_value=1)
GENERAL_NEWS_DEFAULT_LIMIT = env_int(
    "GENERAL_NEWS_DEFAULT_LIMIT", NEWS_UI_DEFAULT_LIMIT, min_value=1
)

GENERAL_NEWS_DEFAULT_CATEGORY = env("GENERAL_NEWS_DEFAULT_CATEGORY", "all")
GENERAL_NEWS_ALLOWED_CATEGORIES: list[str] = [
    "all",
    "markets",
    "world",
    "finance",
    "tech",
    "macro",
    "central_bank",
    "regulatory",
    "forex",
    "crypto",
]

GENERAL_NEWS_RSS_PRIMARY = True
GENERAL_NEWS_RSS_MAX_FEEDS = 50
GENERAL_NEWS_RSS_MAX_ITEMS_PER_FEED = 30

GENERAL_NEWS_VENDOR_TIMEOUT_SECONDS = env_int(
    "GENERAL_NEWS_VENDOR_TIMEOUT_SECONDS", 10, min_value=1
)
GENERAL_NEWS_VENDOR_MAX_RETRIES = env_int("GENERAL_NEWS_VENDOR_MAX_RETRIES", 1, min_value=0)

GENERAL_NEWS_CACHE_ENABLED = env_bool("GENERAL_NEWS_CACHE_ENABLED", True)
# NewsArticleStore DB: market-wide articles. Also read by the RAG chatbot as
# its News pool (services/rag_pool.py). See NEWS_CACHE_DB_PATH for the separate
# per-ticker cache.
GENERAL_NEWS_CACHE_DB_PATH = ".cache/general_news.sqlite3"
GENERAL_NEWS_CACHE_MAX_ENTRIES = env_int("GENERAL_NEWS_CACHE_MAX_ENTRIES", 1000, min_value=1)

# ─── RAG Chatbot ──────────────────────────────────────────────────────────────
RAG_CHATBOT_ENABLED = env_bool("RAG_CHATBOT_ENABLED", True)
# Empty string = use QUICK_THINK_LLM from the main LLM config.
RAG_CHATBOT_LLM_MODEL = env("RAG_CHATBOT_LLM_MODEL", "")
RAG_CHATBOT_MAX_CONTEXT_ARTICLES = env_int("RAG_CHATBOT_MAX_CONTEXT_ARTICLES", 15, min_value=1)
RAG_CHATBOT_MAX_CONTEXT_ANALYSES = env_int("RAG_CHATBOT_MAX_CONTEXT_ANALYSES", 5, min_value=1)
RAG_CHATBOT_NEWS_POOL_TTL_SECONDS = env_int("RAG_CHATBOT_NEWS_POOL_TTL_SECONDS", 300, min_value=60)
RAG_CHATBOT_MARKET_POOL_TTL_SECONDS = env_int(
    "RAG_CHATBOT_MARKET_POOL_TTL_SECONDS", 120, min_value=60
)
# Macro moves slowly; cache the econ snapshot for 30 min.
RAG_CHATBOT_ECON_POOL_TTL_SECONDS = env_int("RAG_CHATBOT_ECON_POOL_TTL_SECONDS", 1800, min_value=60)
RAG_CHATBOT_CHAT_TIMEOUT_SECONDS = env_int("RAG_CHATBOT_CHAT_TIMEOUT_SECONDS", 30, min_value=5)

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

# Debug routes
DEBUG_ENDPOINTS_ENABLED = env_bool("DEBUG_ENDPOINTS_ENABLED", False)
