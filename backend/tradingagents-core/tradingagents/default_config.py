import os

_TRADINGAGENTS_HOME = os.path.join(os.path.expanduser("~"), ".tradingagents")


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _env_bool(name: str, default: bool) -> bool:
    value = _env(name)
    if not value:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


DEFAULT_CONFIG = {
    "project_dir": os.path.abspath(os.path.join(os.path.dirname(__file__), ".")),
    "results_dir": os.path.join(_TRADINGAGENTS_HOME, "logs"),
    "data_cache_dir": os.path.join(_TRADINGAGENTS_HOME, "cache"),
    "memory_log_path": os.path.join(_TRADINGAGENTS_HOME, "memory", "trading_memory.md"),
    "memory_log_max_entries": 300,
    "memory_log_ttl_days": 90,
    # LLM model selection is environment-driven; backend/config.py validates
    # these before starting the API.
    "llm_provider": _env("LLM_PROVIDER"),
    "deep_think_llm": _env("DEEP_THINK_LLM"),
    "quick_think_llm": _env("QUICK_THINK_LLM"),
    "backend_url": None,
    # Resilience
    "timeout": 60,
    "llm_max_retries": 1,
    "llm_retry_base_delay": 1.5,
    "llm_retry_max_delay": 30,
    "circuit_breaker_failure_threshold": 5,
    "circuit_breaker_recovery_seconds": 60,
    "tool_timeout_seconds": 45,
    "tool_max_retries": 3,
    # Cache
    "cache_ttl_seconds": 900,
    "cache_max_entries": 512,
    "llm_exact_cache_enabled": _env_bool("LLM_EXACT_CACHE_ENABLED", True),
    "llm_exact_cache_ttl_seconds": int(_env("LLM_EXACT_CACHE_TTL_SECONDS") or "1800"),
    "llm_exact_cache_max_entries": int(_env("LLM_EXACT_CACHE_MAX_ENTRIES") or "1024"),
    "llm_exact_cache_db_path": _env("LLM_EXACT_CACHE_DB_PATH") or ".cache/llm_exact_cache.sqlite3",
    "llm_semantic_cache_enabled": _env_bool("LLM_SEMANTIC_CACHE_ENABLED", False),
    "llm_semantic_cache_ttl_seconds": int(_env("LLM_SEMANTIC_CACHE_TTL_SECONDS") or "3600"),
    "llm_semantic_cache_max_entries": int(_env("LLM_SEMANTIC_CACHE_MAX_ENTRIES") or "2048"),
    "llm_semantic_cache_db_path": _env("LLM_SEMANTIC_CACHE_DB_PATH") or ".cache/llm_semantic_cache.sqlite3",
    "llm_semantic_cache_similarity_threshold": float(_env("LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD") or "0.97"),
    "llm_semantic_cache_targets": _env("LLM_SEMANTIC_CACHE_TARGETS") or "news_summary,company_profile",
    # Pipeline
    "parallel_analysts": True,
    "analysis_mode": "balanced",
    "max_gemini_calls": 9,
    "data_collection_workers": int(_env("DATA_COLLECTION_WORKERS") or "12"),
    # Reasoning effort (provider-specific, None = default)
    "google_thinking_level": None,
    "openai_reasoning_effort": None,
    "anthropic_effort": None,
    "checkpoint_enabled": False,
    "output_language": "English",
    # Debate
    "max_debate_rounds": 3,
    "max_risk_discuss_rounds": 1,
    "adaptive_debate_enabled": True,
    "debate_min_rounds": 2,
    "debate_confidence_gap": 0.18,
    "debate_consensus_threshold": 0.72,
    "risk_min_rounds": 2,
    "risk_consensus_threshold": 0.72,
    "max_recur_limit": 100,
    "finnhub": {
        "enabled": (_env("FINNHUB_ENABLED") or "false").lower() == "true",
        "api_key": _env("FINNHUB_API_KEY") or "",
        "base_url": _env("FINNHUB_BASE_URL") or "https://finnhub.io/api/v1",
        "timeout_seconds": int(_env("FINNHUB_TIMEOUT_SECONDS") or "15"),
        "max_retries": int(_env("FINNHUB_MAX_RETRIES") or "1"),
        "retry_backoff_seconds": float(_env("FINNHUB_RETRY_BACKOFF_SECONDS") or "1"),
        "enable_stock_data": (_env("FINNHUB_ENABLE_STOCK_DATA") or "true").lower() == "true",
        "enable_fundamentals": (_env("FINNHUB_ENABLE_FUNDAMENTALS") or "true").lower() == "true",
        "enable_news": (_env("FINNHUB_ENABLE_NEWS") or "true").lower() == "true",
        "enable_sentiment": (_env("FINNHUB_ENABLE_SENTIMENT") or "true").lower() == "true",
        "enable_events": (_env("FINNHUB_ENABLE_EVENTS") or "true").lower() == "true",
        "enable_insider": (_env("FINNHUB_ENABLE_INSIDER") or "true").lower() == "true",
        "enable_forex": (_env("FINNHUB_ENABLE_FOREX") or "false").lower() == "true",
        "enable_crypto": (_env("FINNHUB_ENABLE_CRYPTO") or "false").lower() == "true",
        "enable_symbol_resolver": (_env("FINNHUB_ENABLE_SYMBOL_RESOLVER") or "true").lower() == "true",
        "quote_cache_ttl_seconds": int(_env("FINNHUB_QUOTE_CACHE_TTL_SECONDS") or "120"),
        "ohlcv_cache_ttl_seconds": int(_env("FINNHUB_OHLCV_CACHE_TTL_SECONDS") or "21600"),
        "profile_cache_ttl_seconds": int(_env("FINNHUB_PROFILE_CACHE_TTL_SECONDS") or "604800"),
        "metrics_cache_ttl_seconds": int(_env("FINNHUB_METRICS_CACHE_TTL_SECONDS") or "604800"),
        "financial_statement_cache_ttl_seconds": int(
            _env("FINNHUB_FINANCIAL_STATEMENT_CACHE_TTL_SECONDS") or "2592000"
        ),
        "news_cache_ttl_seconds": int(_env("FINNHUB_NEWS_CACHE_TTL_SECONDS") or "3600"),
        "sentiment_cache_ttl_seconds": int(_env("FINNHUB_SENTIMENT_CACHE_TTL_SECONDS") or "3600"),
        "event_cache_ttl_seconds": int(_env("FINNHUB_EVENT_CACHE_TTL_SECONDS") or "43200"),
        "insider_cache_ttl_seconds": int(_env("FINNHUB_INSIDER_CACHE_TTL_SECONDS") or "43200"),
        "forex_cache_ttl_seconds": int(_env("FINNHUB_FOREX_CACHE_TTL_SECONDS") or "300"),
        "crypto_cache_ttl_seconds": int(_env("FINNHUB_CRYPTO_CACHE_TTL_SECONDS") or "120"),
        "symbol_cache_ttl_seconds": int(_env("FINNHUB_SYMBOL_CACHE_TTL_SECONDS") or "2592000"),
        "max_calls_per_analysis": int(_env("FINNHUB_MAX_CALLS_PER_ANALYSIS") or "8"),
    },
    "idx_official": {
        "enabled": _env_bool("IDX_OFFICIAL_ENABLED", True),
        "report_index_url": _env("IDX_REPORT_INDEX_URL"),
        "report_index_path": _env("IDX_REPORT_INDEX_PATH"),
        "report_cache_dir": _env("IDX_REPORT_CACHE_DIR") or ".cache/idx_reports",
        "report_timeout_seconds": int(_env("IDX_REPORT_TIMEOUT_SECONDS") or "20"),
        "report_prefer_formats": _env("IDX_REPORT_PREFER_FORMATS") or "xbrl,xlsx,csv,json,pdf",
    },
    "news": {
        "marketaux_api_key": _env("MARKETAUX_API_KEY"),
        "newsdata_api_key": _env("NEWSDATA_API_KEY"),
        "provider_priority": _env("NEWS_PROVIDER_PRIORITY") or "marketaux,newsdata",
        "enabled_providers": _env("NEWS_ENABLED_PROVIDERS") or "marketaux,newsdata",
        "default_window_days": int(_env("NEWS_DEFAULT_WINDOW_DAYS") or "30"),
        "max_articles_per_provider": int(_env("NEWS_MAX_ARTICLES_PER_PROVIDER") or "20"),
        "max_articles_for_prompt": int(_env("NEWS_MAX_ARTICLES_FOR_PROMPT") or "10"),
        "max_articles_for_ui": int(_env("NEWS_MAX_ARTICLES_FOR_UI") or "30"),
        "min_relevance_score": float(_env("NEWS_MIN_RELEVANCE_SCORE") or "40"),
        "prompt_min_relevance_score": float(_env("NEWS_PROMPT_MIN_RELEVANCE_SCORE") or "55"),
        "cache_enabled": _env_bool("NEWS_CACHE_ENABLED", True),
        "cache_ttl_minutes": int(_env("NEWS_CACHE_TTL_MINUTES") or "360"),
        "cache_db_path": _env("NEWS_CACHE_DB_PATH") or ".cache/news_data.sqlite3",
        "cache_max_entries": int(_env("NEWS_CACHE_MAX_ENTRIES") or "512"),
        "debug_raw_response": _env_bool("NEWS_DEBUG_RAW_RESPONSE", False),
        "log_provider_requests": _env_bool("NEWS_LOG_PROVIDER_REQUESTS", True),
        "vendor_timeout_seconds": int(_env("NEWS_VENDOR_TIMEOUT_SECONDS") or "15"),
        "vendor_max_retries": int(_env("NEWS_VENDOR_MAX_RETRIES") or "2"),
        "fetch_secondary_always": _env_bool("NEWS_FETCH_SECONDARY_ALWAYS", True),
        "secondary_fetch_threshold": int(_env("NEWS_SECONDARY_FETCH_THRESHOLD") or "3"),
        "enable_yfinance_fallback": _env_bool("NEWS_ENABLE_YFINANCE_FALLBACK", True),
    },
    "data_vendors": {
        "core_stock_apis": _env("DATA_VENDOR_CORE_STOCK_APIS") or "yfinance,finnhub,alpha_vantage",
        "quote_data": _env("DATA_VENDOR_QUOTE_DATA") or "yfinance,finnhub,alpha_vantage",
        "technical_indicators": _env("DATA_VENDOR_TECHNICAL_INDICATORS") or "yfinance,finnhub,alpha_vantage",
        "fundamental_data": _env("DATA_VENDOR_FUNDAMENTAL_DATA") or "yfinance,finnhub,alpha_vantage",
        "financial_statements": _env("DATA_VENDOR_FINANCIAL_STATEMENTS") or "yfinance,alpha_vantage,finnhub",
        "news_data": _env("DATA_VENDOR_NEWS_DATA") or "marketaux,newsdata,yfinance,finnhub,alpha_vantage",
        "global_news_data": _env("DATA_VENDOR_GLOBAL_NEWS_DATA") or "finnhub,alpha_vantage,yfinance",
        "sentiment_data": _env("DATA_VENDOR_SENTIMENT_DATA") or "finnhub,alpha_vantage",
        "social_sentiment": _env("DATA_VENDOR_SOCIAL_SENTIMENT") or "finnhub",
        "event_data": _env("DATA_VENDOR_EVENT_DATA") or "finnhub",
        "analyst_rating": _env("DATA_VENDOR_ANALYST_RATING") or "finnhub",
        "insider_data": _env("DATA_VENDOR_INSIDER_DATA") or "finnhub,alpha_vantage,yfinance",
        "forex_data": _env("DATA_VENDOR_FOREX_DATA") or "finnhub,alpha_vantage",
        "crypto_data": _env("DATA_VENDOR_CRYPTO_DATA") or "finnhub,alpha_vantage",
    },
    "data_vendor_max_calls_per_analysis": int(_env("DATA_VENDOR_MAX_CALLS_PER_ANALYSIS") or "40"),
    "data_vendor_enable_multi_source_news": (_env("DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS") or "true").lower() == "true",
    "data_vendor_enable_multi_source_price": (_env("DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE") or "false").lower()
    == "true",
    "data_vendor_enable_finnhub_fallback": (_env("DATA_VENDOR_ENABLE_FINNHUB_FALLBACK") or "true").lower() == "true",
    "data_vendor_enable_finnhub_enrichment": (_env("DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT") or "true").lower()
    == "true",
    "data_vendor_require_source_metadata": (_env("DATA_VENDOR_REQUIRE_SOURCE_METADATA") or "true").lower() == "true",
    "data_vendor_return_partial_on_failure": (_env("DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE") or "true").lower()
    == "true",
    "max_news_per_vendor": int(_env("MAX_NEWS_PER_VENDOR") or "10"),
    "max_total_news_items": int(_env("MAX_TOTAL_NEWS_ITEMS") or "25"),
    "news_dedup_by": _env("NEWS_DEDUP_BY") or "url,title",
    "news_min_relevance_score": float(_env("DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE") or "0.35"),
    "default_indonesia_suffix": _env("DEFAULT_INDONESIA_SUFFIX") or ".JK",
    "default_forex_exchange": _env("DEFAULT_FOREX_EXCHANGE") or "OANDA",
    "default_crypto_exchange": _env("DEFAULT_CRYPTO_EXCHANGE") or "BINANCE",
    "default_us_exchange": _env("DEFAULT_US_EXCHANGE") or "US",
    "tool_vendors": {},
}
