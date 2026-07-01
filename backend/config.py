"""Compatibility facade for backend configuration.

The concrete settings live in focused modules:
- config_env.py: .env loading and typed parsing helpers
- config_defaults.py: non-secret operational defaults
- config_llm.py: provider/model settings and TradingAgents config builder
- config_validation.py: startup validation

This module preserves the existing `from config import ...` API. Tests that need
environment-sensitive settings must call `reload_config_for_tests()` explicitly.
"""

from __future__ import annotations

# ruff: noqa: E402,F401,I001

import importlib
import sys

_CONFIG_MODULES = ("config_env", "config_defaults", "config_llm", "config_validation")


def reload_config_for_tests():
    """Reload config modules only when tests explicitly request fresh env state."""
    for module_name in _CONFIG_MODULES:
        module = importlib.import_module(module_name)
        importlib.reload(module)
    return importlib.reload(sys.modules[__name__])


from config_defaults import (
    ADAPTIVE_DEBATE_ENABLED,
    ANALYSIS_DEPTH_CONFIG,
    ANALYSIS_DEPTH_LLM_BUDGETS,
    ANALYSIS_DEPTHS,
    ANALYSIS_DATABASE_URL,
    ANALYSIS_DB_PATH,
    ANALYSIS_HISTORY_DEFAULT_LIMIT,
    ANALYSIS_HISTORY_MAX_ROWS,
    ANALYSIS_JOB_CACHE_DB_PATH,
    ANALYSIS_JOB_ROUTING_MODE,
    ANALYSIS_JOB_STORE_BACKEND,
    ANALYSIS_JOB_EVENT_REPLAY_LIMIT,
    ANALYSIS_JOB_MAX_ACTIVE,
    ANALYSIS_JOB_MAX_ENTRIES,
    ANALYSIS_JOB_TTL_SECONDS,
    ANALYSIS_MODE,
    ANALYSIS_RESULT_CACHE_MAX_ENTRIES,
    ANALYSIS_RESULT_CACHE_TTL_SECONDS,
    ANALYSIS_STORAGE_BACKEND,
    ANALYST_PARALLEL_WORKERS,
    ALPHA_VANTAGE_API_KEY,
    API_KEY,
    APP_ENV,
    APP_NAME,
    BACKEND_PORT,
    CACHE_MAX_ENTRIES,
    CACHE_TTL_SECONDS,
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_RECOVERY_SECONDS,
    CORS_ORIGINS,
    DATA_CACHE_BACKEND,
    DATA_CACHE_DB_PATH,
    DATA_CACHE_MAX_ENTRIES,
    DATA_CACHE_TTL_SECONDS,
    DATA_COLLECTION_WORKERS,
    PRICE_CACHE_TTL_SECONDS,
    PRICE_MAX_FALLBACK_DAYS,
    QUANT_RISK_FREE_RATE,
    DATA_VENDOR_ANALYST_RATING,
    DATA_VENDOR_CORE_STOCK_APIS,
    DATA_VENDOR_CRYPTO_DATA,
    DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT,
    DATA_VENDOR_ENABLE_FINNHUB_FALLBACK,
    DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS,
    DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE,
    DATA_VENDOR_EVENT_DATA,
    DATA_VENDOR_FINANCIAL_STATEMENTS,
    DATA_VENDOR_FOREX_DATA,
    DATA_VENDOR_FUNDAMENTAL_DATA,
    DATA_VENDOR_GLOBAL_NEWS_DATA,
    DATA_VENDOR_INSIDER_DATA,
    DATA_VENDOR_MAX_CALLS_PER_ANALYSIS,
    DATA_VENDOR_NEWS_DATA,
    DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE,
    DATA_VENDOR_QUOTE_DATA,
    DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE,
    DATA_VENDOR_REQUIRE_SOURCE_METADATA,
    DATA_VENDOR_SENTIMENT_DATA,
    DATA_VENDOR_SOCIAL_SENTIMENT,
    DATA_VENDOR_TECHNICAL_INDICATORS,
    DEBATE_CONFIDENCE_GAP,
    DEBATE_CONSENSUS_THRESHOLD,
    DEBATE_MIN_ROUNDS,
    DEBUG_ENDPOINTS_ENABLED,
    DEEP_THINK_AGENTS,
    DEFAULT_ANALYSIS_DEPTH,
    DEFAULT_DEV_CORS_ORIGINS,
    DEFAULT_MAX_DEBATE_ROUNDS,
    ECONOMIC_WTO_API_KEY,
    FINNHUB_API_KEY,
    GENERAL_NEWS_ALLOWED_CATEGORIES,
    GENERAL_NEWS_CACHE_DB_PATH,
    GENERAL_NEWS_CACHE_ENABLED,
    GENERAL_NEWS_CACHE_MAX_ENTRIES,
    GENERAL_NEWS_CACHE_TTL_SECONDS,
    GENERAL_NEWS_STALE_TTL_SECONDS,
    GENERAL_NEWS_DEFAULT_CATEGORY,
    GENERAL_NEWS_DEFAULT_LIMIT,
    GENERAL_NEWS_DEFAULT_WINDOW_DAYS,
    GENERAL_NEWS_ENABLED,
    GENERAL_NEWS_ENABLED_PROVIDERS,
    GENERAL_NEWS_ENABLE_BACKGROUND_REFRESH,
    GENERAL_NEWS_ENABLE_SSE,
    GENERAL_NEWS_FRONTEND_POLL_SECONDS,
    GENERAL_NEWS_MAX_ARTICLES_FOR_UI,
    GENERAL_NEWS_MAX_ARTICLES_PER_PROVIDER,
    GENERAL_NEWS_PROVIDER_PRIORITY,
    GENERAL_NEWS_REFRESH_INTERVAL_SECONDS,
    GENERAL_NEWS_RSS_MAX_FEEDS,
    GENERAL_NEWS_RSS_MAX_ITEMS_PER_FEED,
    GENERAL_NEWS_RSS_PRIMARY,
    GENERAL_NEWS_VENDOR_MAX_RETRIES,
    GENERAL_NEWS_VENDOR_TIMEOUT_SECONDS,
    FRONTEND_PORT,
    IS_DEVELOPMENT,
    IS_PRODUCTION,
    LLM_429_MAX_WAIT_SECONDS,
    LLM_EXACT_CACHE_DB_PATH,
    LLM_EXACT_CACHE_ENABLED,
    LLM_EXACT_CACHE_MAX_ENTRIES,
    LLM_EXACT_CACHE_TTL_SECONDS,
    LLM_BUDGET_BY_ANALYSIS_DEPTH,
    LLM_MAX_RETRIES,
    LLM_RETRIES_BY_DEPTH,
    LLM_RETRY_BASE_DELAY,
    LLM_RETRY_MAX_DELAY,
    LLM_SEMANTIC_CACHE_DB_PATH,
    LLM_SEMANTIC_CACHE_ENABLED,
    LLM_SEMANTIC_CACHE_MAX_ENTRIES,
    LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
    LLM_SEMANTIC_CACHE_TARGETS,
    LLM_SEMANTIC_CACHE_TTL_SECONDS,
    LLM_TIMEOUT_SECONDS,
    MARKETAUX_API_KEY,
    MAX_CONCURRENT_LLM_CALLS,
    MAX_CONCURRENT_REQUESTS_PER_KEY,
    MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY,
    MAX_CONCURRENT_STREAMS_PER_KEY,
    MAX_GEMINI_CALLS,
    MAX_RISK_DISCUSS_ROUNDS,
    NEWSDATA_API_KEY,
    NEWS_ARTICLE_RETENTION_DAYS,
    NEWS_BACKGROUND_REFRESH_SECONDS,
    NEWS_CACHE_ENABLED,
    NEWS_CACHE_MAX_ENTRIES,
    NEWS_CACHE_TTL_MINUTES,
    NEWS_DEBUG_RAW_RESPONSE,
    NEWS_DECISION_MIN_RELEVANCE_SCORE,
    NEWS_DEFAULT_WINDOW_DAYS,
    NEWS_ENABLED_PROVIDERS,
    NEWS_ENABLE_YFINANCE_FALLBACK,
    NEWS_FETCH_SECONDARY_ALWAYS,
    NEWS_FORCE_ALL_PROVIDERS,
    NEWS_FORCE_REFRESH_ALLOWED,
    NEWS_LOG_PROVIDER_REQUESTS,
    NEWS_MAX_ARTICLES_FOR_PROMPT,
    NEWS_MAX_ARTICLES_FOR_UI,
    NEWS_MAX_ARTICLES_PER_PROVIDER,
    NEWS_MAX_STORED_ARTICLES,
    NEWS_MIN_RELEVANCE_SCORE,
    NEWS_PROMPT_MIN_RELEVANCE_SCORE,
    NEWS_PROVIDER_429_COOLDOWN_SECONDS,
    NEWS_PROVIDER_MAX_CONCURRENCY,
    NEWS_PROVIDER_PRIORITY,
    NEWS_RSS_DECISION_MIN_RELEVANCE_SCORE,
    NEWS_RSS_DISABLED_FEED_IDS,
    NEWS_RSS_ENABLED,
    NEWS_RSS_ENABLED_FEED_IDS,
    NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED,
    NEWS_RSS_INCLUDE_TRIAL_FEEDS,
    NEWS_RSS_MAX_FEEDS,
    NEWS_RSS_MAX_CONCURRENCY,
    NEWS_RSS_MAX_ITEMS_PER_FEED,
    NEWS_RSS_ROTATION_BATCH_SIZE,
    NEWS_RSS_USER_AGENT,
    NEWS_SECONDARY_FETCH_THRESHOLD,
    NEWS_STRICT_AI_ANALYSIS_MODE,
    NEWS_UI_DEFAULT_LIMIT,
    NEWS_VENDOR_MAX_RETRIES,
    NEWS_VENDOR_TIMEOUT_SECONDS,
    NEWS_MANUAL_REFRESH_COOLDOWN_SECONDS,
    OWNER_SESSION_SECRET,
    OWNER_SESSION_TTL_SECONDS,
    PIPELINE_LLM_CALL_TIMEOUT_SECONDS,
    PIPELINE_STAGE_TIMEOUT_SECONDS,
    PIPELINE_TIMEOUT_SECONDS,
    PIPELINE_TOTAL_TIMEOUT_SECONDS,
    PREFLIGHT_TIMEOUT_SECONDS,
    PROCESS_POOL_MAX_TASKS_PER_CHILD,
    PROCESS_POOL_WORKERS,
    PROVIDER_SDK_MAX_RETRIES,
    RAG_CHATBOT_CHAT_TIMEOUT_SECONDS,
    RAG_CHATBOT_ENABLED,
    RAG_CHATBOT_LLM_MODEL,
    RAG_CHATBOT_ECON_POOL_TTL_SECONDS,
    RAG_CHATBOT_MARKET_POOL_TTL_SECONDS,
    RAG_CHATBOT_MAX_CONTEXT_ANALYSES,
    RAG_CHATBOT_MAX_CONTEXT_ARTICLES,
    RAG_CHATBOT_NEWS_POOL_TTL_SECONDS,
    RATE_LIMIT_DB_PATH,
    RATE_LIMIT_STORAGE_BACKEND,
    REQUEST_BODY_MAX_BYTES,
    REQUEST_RATE_LIMIT_PER_MINUTE,
    REQUIRE_API_KEY_FOR_RATE_LIMIT,
    RESPONSE_DETAILS,
    RISK_CONSENSUS_THRESHOLD,
    RISK_MIN_ROUNDS,
    STATUS_RATE_LIMIT_PER_MINUTE,
    STREAM_RATE_LIMIT_PER_MINUTE,
    TARGET_RISK_REWARD,
    TOOL_MAX_RETRIES,
    TOOL_TIMEOUT_SECONDS,
)
from config_llm import (
    KNOWN_MODELS,
    LLMSettings,
    MODEL_CATALOG,
    SUPPORTED_PROVIDERS,
    build_tradingagents_config,
    llm,
)
from config_validation import PROVIDER_KEY_REQUIREMENTS, validate_startup_config


class _BackendSettingsShim:
    """Compatibility shim for code that still references `settings.*`."""

    app_name = APP_NAME
    environment = APP_ENV
    cors_origins = CORS_ORIGINS
    pipeline_timeout_seconds = PIPELINE_TIMEOUT_SECONDS
    pipeline_total_timeout_seconds = PIPELINE_TOTAL_TIMEOUT_SECONDS
    pipeline_stage_timeout_seconds = PIPELINE_STAGE_TIMEOUT_SECONDS
    pipeline_llm_call_timeout_seconds = PIPELINE_LLM_CALL_TIMEOUT_SECONDS
    preflight_timeout_seconds = PREFLIGHT_TIMEOUT_SECONDS
    process_pool_workers = PROCESS_POOL_WORKERS
    data_collection_workers = DATA_COLLECTION_WORKERS
    price_max_fallback_days = PRICE_MAX_FALLBACK_DAYS
    analyst_parallel_workers = ANALYST_PARALLEL_WORKERS
    default_max_debate_rounds = DEFAULT_MAX_DEBATE_ROUNDS
    max_risk_discuss_rounds = MAX_RISK_DISCUSS_ROUNDS
    analysis_mode = ANALYSIS_MODE
    default_analysis_depth = DEFAULT_ANALYSIS_DEPTH
    analysis_depth_config = ANALYSIS_DEPTH_CONFIG
    analysis_depth_llm_budgets = ANALYSIS_DEPTH_LLM_BUDGETS
    llm_budget_by_analysis_depth = LLM_BUDGET_BY_ANALYSIS_DEPTH
    max_gemini_calls = MAX_GEMINI_CALLS
    request_rate_limit_per_minute = REQUEST_RATE_LIMIT_PER_MINUTE
    status_rate_limit_per_minute = STATUS_RATE_LIMIT_PER_MINUTE
    stream_rate_limit_per_minute = STREAM_RATE_LIMIT_PER_MINUTE
    max_concurrent_requests_per_key = MAX_CONCURRENT_REQUESTS_PER_KEY
    max_concurrent_status_requests_per_key = MAX_CONCURRENT_STATUS_REQUESTS_PER_KEY
    max_concurrent_streams_per_key = MAX_CONCURRENT_STREAMS_PER_KEY
    request_body_max_bytes = REQUEST_BODY_MAX_BYTES
    require_api_key_for_rate_limit = REQUIRE_API_KEY_FOR_RATE_LIMIT
    llm_timeout_seconds = LLM_TIMEOUT_SECONDS
    llm_max_retries = LLM_MAX_RETRIES
    deep_think_agents = DEEP_THINK_AGENTS
    target_risk_reward = TARGET_RISK_REWARD
    provider_sdk_max_retries = PROVIDER_SDK_MAX_RETRIES
    max_concurrent_llm_calls = MAX_CONCURRENT_LLM_CALLS
    cache_ttl_seconds = CACHE_TTL_SECONDS
    cache_max_entries = CACHE_MAX_ENTRIES
    price_cache_ttl_seconds = PRICE_CACHE_TTL_SECONDS
    llm_exact_cache_enabled = LLM_EXACT_CACHE_ENABLED
    llm_exact_cache_ttl_seconds = LLM_EXACT_CACHE_TTL_SECONDS
    llm_exact_cache_max_entries = LLM_EXACT_CACHE_MAX_ENTRIES
    llm_exact_cache_db_path = LLM_EXACT_CACHE_DB_PATH
    llm_semantic_cache_enabled = LLM_SEMANTIC_CACHE_ENABLED
    llm_semantic_cache_ttl_seconds = LLM_SEMANTIC_CACHE_TTL_SECONDS
    llm_semantic_cache_max_entries = LLM_SEMANTIC_CACHE_MAX_ENTRIES
    llm_semantic_cache_db_path = LLM_SEMANTIC_CACHE_DB_PATH
    llm_semantic_cache_similarity_threshold = LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD
    llm_semantic_cache_targets = LLM_SEMANTIC_CACHE_TARGETS
    analysis_result_cache_ttl_seconds = ANALYSIS_RESULT_CACHE_TTL_SECONDS
    analysis_result_cache_max_entries = ANALYSIS_RESULT_CACHE_MAX_ENTRIES
    analysis_db_path = ANALYSIS_DB_PATH
    analysis_history_max_rows = ANALYSIS_HISTORY_MAX_ROWS
    analysis_history_default_limit = ANALYSIS_HISTORY_DEFAULT_LIMIT
    analysis_job_ttl_seconds = ANALYSIS_JOB_TTL_SECONDS
    analysis_job_cache_db_path = ANALYSIS_JOB_CACHE_DB_PATH
    analysis_job_store_backend = ANALYSIS_JOB_STORE_BACKEND
    analysis_job_routing_mode = ANALYSIS_JOB_ROUTING_MODE
    analysis_storage_backend = ANALYSIS_STORAGE_BACKEND
    analysis_database_url = ANALYSIS_DATABASE_URL
    rate_limit_storage_backend = RATE_LIMIT_STORAGE_BACKEND
    rate_limit_db_path = RATE_LIMIT_DB_PATH
    owner_session_secret = OWNER_SESSION_SECRET
    owner_session_ttl_seconds = OWNER_SESSION_TTL_SECONDS
    data_vendor_core_stock_apis = DATA_VENDOR_CORE_STOCK_APIS
    data_vendor_quote_data = DATA_VENDOR_QUOTE_DATA
    data_vendor_technical_indicators = DATA_VENDOR_TECHNICAL_INDICATORS
    data_vendor_fundamental_data = DATA_VENDOR_FUNDAMENTAL_DATA
    data_vendor_financial_statements = DATA_VENDOR_FINANCIAL_STATEMENTS
    data_vendor_news_data = DATA_VENDOR_NEWS_DATA
    data_vendor_global_news_data = DATA_VENDOR_GLOBAL_NEWS_DATA
    data_vendor_sentiment_data = DATA_VENDOR_SENTIMENT_DATA
    data_vendor_social_sentiment = DATA_VENDOR_SOCIAL_SENTIMENT
    data_vendor_event_data = DATA_VENDOR_EVENT_DATA
    data_vendor_analyst_rating = DATA_VENDOR_ANALYST_RATING
    data_vendor_insider_data = DATA_VENDOR_INSIDER_DATA
    data_vendor_forex_data = DATA_VENDOR_FOREX_DATA
    data_vendor_crypto_data = DATA_VENDOR_CRYPTO_DATA
    data_vendor_news_min_relevance_score = DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE
    data_vendor_enable_multi_source_news = DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS
    data_vendor_enable_multi_source_price = DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE
    data_vendor_enable_finnhub_fallback = DATA_VENDOR_ENABLE_FINNHUB_FALLBACK
    data_vendor_enable_finnhub_enrichment = DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT
    data_vendor_require_source_metadata = DATA_VENDOR_REQUIRE_SOURCE_METADATA
    data_vendor_return_partial_on_failure = DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE
    data_vendor_max_calls_per_analysis = DATA_VENDOR_MAX_CALLS_PER_ANALYSIS
    process_pool_max_tasks_per_child = PROCESS_POOL_MAX_TASKS_PER_CHILD
    analysis_job_max_entries = ANALYSIS_JOB_MAX_ENTRIES
    analysis_job_max_active = ANALYSIS_JOB_MAX_ACTIVE
    analysis_job_event_replay_limit = ANALYSIS_JOB_EVENT_REPLAY_LIMIT
    data_cache_backend = DATA_CACHE_BACKEND
    tool_timeout_seconds = TOOL_TIMEOUT_SECONDS
    tool_max_retries = TOOL_MAX_RETRIES
    news_strict_ai_analysis_mode = NEWS_STRICT_AI_ANALYSIS_MODE
    news_provider_priority = NEWS_PROVIDER_PRIORITY
    news_enabled_providers = NEWS_ENABLED_PROVIDERS
    news_fetch_secondary_always = NEWS_FETCH_SECONDARY_ALWAYS
    news_force_all_providers = NEWS_FORCE_ALL_PROVIDERS
    news_enable_yfinance_fallback = NEWS_ENABLE_YFINANCE_FALLBACK
    news_default_window_days = NEWS_DEFAULT_WINDOW_DAYS
    news_max_articles_per_provider = NEWS_MAX_ARTICLES_PER_PROVIDER
    news_max_articles_for_ui = NEWS_MAX_ARTICLES_FOR_UI
    news_max_articles_for_prompt = NEWS_MAX_ARTICLES_FOR_PROMPT
    news_min_relevance_score = NEWS_MIN_RELEVANCE_SCORE
    news_prompt_min_relevance_score = NEWS_PROMPT_MIN_RELEVANCE_SCORE
    news_decision_min_relevance_score = NEWS_DECISION_MIN_RELEVANCE_SCORE
    news_rss_decision_min_relevance_score = NEWS_RSS_DECISION_MIN_RELEVANCE_SCORE
    news_rss_enabled = NEWS_RSS_ENABLED
    news_rss_enabled_feed_ids = NEWS_RSS_ENABLED_FEED_IDS
    news_rss_max_feeds = NEWS_RSS_MAX_FEEDS
    news_rss_max_items_per_feed = NEWS_RSS_MAX_ITEMS_PER_FEED
    news_rss_include_trial_feeds = NEWS_RSS_INCLUDE_TRIAL_FEEDS
    news_rss_google_news_fallback_enabled = NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED
    news_rss_disabled_feed_ids = NEWS_RSS_DISABLED_FEED_IDS
    news_rss_user_agent = NEWS_RSS_USER_AGENT
    news_cache_enabled = NEWS_CACHE_ENABLED
    news_cache_ttl_minutes = NEWS_CACHE_TTL_MINUTES
    news_cache_max_entries = NEWS_CACHE_MAX_ENTRIES
    news_debug_raw_response = NEWS_DEBUG_RAW_RESPONSE
    news_log_provider_requests = NEWS_LOG_PROVIDER_REQUESTS
    news_vendor_timeout_seconds = NEWS_VENDOR_TIMEOUT_SECONDS
    news_vendor_max_retries = NEWS_VENDOR_MAX_RETRIES
    news_secondary_fetch_threshold = NEWS_SECONDARY_FETCH_THRESHOLD
    general_news_enabled = GENERAL_NEWS_ENABLED
    general_news_provider_priority = GENERAL_NEWS_PROVIDER_PRIORITY
    general_news_enabled_providers = GENERAL_NEWS_ENABLED_PROVIDERS
    general_news_enable_background_refresh = GENERAL_NEWS_ENABLE_BACKGROUND_REFRESH
    general_news_refresh_interval_seconds = GENERAL_NEWS_REFRESH_INTERVAL_SECONDS
    general_news_cache_ttl_seconds = GENERAL_NEWS_CACHE_TTL_SECONDS
    general_news_frontend_poll_seconds = GENERAL_NEWS_FRONTEND_POLL_SECONDS
    general_news_enable_sse = GENERAL_NEWS_ENABLE_SSE
    general_news_default_window_days = GENERAL_NEWS_DEFAULT_WINDOW_DAYS
    general_news_max_articles_per_provider = GENERAL_NEWS_MAX_ARTICLES_PER_PROVIDER
    general_news_max_articles_for_ui = GENERAL_NEWS_MAX_ARTICLES_FOR_UI
    general_news_default_limit = GENERAL_NEWS_DEFAULT_LIMIT
    general_news_default_category = GENERAL_NEWS_DEFAULT_CATEGORY
    general_news_allowed_categories = GENERAL_NEWS_ALLOWED_CATEGORIES
    general_news_rss_primary = GENERAL_NEWS_RSS_PRIMARY
    general_news_rss_max_feeds = GENERAL_NEWS_RSS_MAX_FEEDS
    general_news_rss_max_items_per_feed = GENERAL_NEWS_RSS_MAX_ITEMS_PER_FEED
    general_news_vendor_timeout_seconds = GENERAL_NEWS_VENDOR_TIMEOUT_SECONDS
    general_news_vendor_max_retries = GENERAL_NEWS_VENDOR_MAX_RETRIES
    general_news_cache_enabled = GENERAL_NEWS_CACHE_ENABLED
    general_news_cache_max_entries = GENERAL_NEWS_CACHE_MAX_ENTRIES

    @property
    def llm_provider(self):
        return llm.provider

    @property
    def deep_think_llm(self):
        return llm.deep_think_llm

    @property
    def quick_think_llm(self):
        return llm.quick_think_llm

    @property
    def api_key(self):
        return API_KEY

    @property
    def llm_api_key(self):
        return llm.llm_api_key

    @property
    def llm_base_url(self):
        return llm.base_url

    def tradingagents_overrides(self):
        return llm.tradingagents_overrides()


settings = _BackendSettingsShim()
