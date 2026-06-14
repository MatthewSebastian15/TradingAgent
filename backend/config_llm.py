"""LLM provider settings and TradingAgents config builder."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from tradingagents.llm_clients import model_catalog as llm_model_catalog

from config_defaults import (
    ANALYSIS_DEPTH_CONFIG,
    ANALYSIS_DEPTH_LLM_BUDGETS,
    ANALYSIS_DEPTHS,
    ANALYSIS_MODE,
    ANALYST_PARALLEL_WORKERS,
    CACHE_MAX_ENTRIES,
    CACHE_TTL_SECONDS,
    DATA_CACHE_BACKEND,
    DATA_CACHE_DB_PATH,
    DATA_CACHE_MAX_ENTRIES,
    DATA_CACHE_TTL_SECONDS,
    DATA_COLLECTION_WORKERS,
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
    DATA_VENDOR_REQUIRE_SOURCE_METADATA,
    DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE,
    DATA_VENDOR_SENTIMENT_DATA,
    DATA_VENDOR_SOCIAL_SENTIMENT,
    DATA_VENDOR_TECHNICAL_INDICATORS,
    DEFAULT_ANALYSIS_DEPTH,
    DEFAULT_MAX_DEBATE_ROUNDS,
    GOOGLE_NEWS_LIGHT_API_KEY,
    LLM_429_MAX_WAIT_SECONDS,
    LLM_EXACT_CACHE_DB_PATH,
    LLM_EXACT_CACHE_ENABLED,
    LLM_EXACT_CACHE_MAX_ENTRIES,
    LLM_EXACT_CACHE_TTL_SECONDS,
    LLM_MAX_RETRIES,
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
    MAX_GEMINI_CALLS,
    MAX_RISK_DISCUSS_ROUNDS,
    NEWS_CACHE_DB_PATH,
    NEWS_CACHE_ENABLED,
    NEWS_CACHE_MAX_ENTRIES,
    NEWS_CACHE_TTL_MINUTES,
    NEWS_DEBUG_RAW_RESPONSE,
    NEWS_DEFAULT_WINDOW_DAYS,
    NEWS_DECISION_MIN_RELEVANCE_SCORE,
    NEWS_ENABLE_YFINANCE_FALLBACK,
    NEWS_ENABLED_PROVIDERS,
    NEWS_FETCH_SECONDARY_ALWAYS,
    NEWS_FORCE_ALL_PROVIDERS,
    NEWS_LOG_PROVIDER_REQUESTS,
    NEWS_MAX_ARTICLES_FOR_PROMPT,
    NEWS_MAX_ARTICLES_FOR_UI,
    NEWS_MAX_ARTICLES_PER_PROVIDER,
    NEWS_MIN_RELEVANCE_SCORE,
    NEWS_PROMPT_MIN_RELEVANCE_SCORE,
    NEWS_PROVIDER_PRIORITY,
    NEWS_RSS_DECISION_MIN_RELEVANCE_SCORE,
    NEWS_RSS_DISABLED_FEED_IDS,
    NEWS_RSS_ENABLED,
    NEWS_RSS_ENABLED_FEED_IDS,
    NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED,
    NEWS_RSS_INCLUDE_TRIAL_FEEDS,
    NEWS_RSS_MAX_FEEDS,
    NEWS_RSS_MAX_ITEMS_PER_FEED,
    NEWS_RSS_USER_AGENT,
    NEWS_SECONDARY_FETCH_THRESHOLD,
    NEWS_STRICT_AI_ANALYSIS_MODE,
    NEWS_VENDOR_MAX_RETRIES,
    NEWS_VENDOR_TIMEOUT_SECONDS,
    NEWSDATA_API_KEY,
    PIPELINE_LLM_CALL_TIMEOUT_SECONDS,
    PIPELINE_STAGE_TIMEOUT_SECONDS,
    PRICE_MAX_FALLBACK_DAYS,
    PROVIDER_SDK_MAX_RETRIES,
    RESPONSE_DETAILS,
    TOOL_MAX_RETRIES,
    TOOL_TIMEOUT_SECONDS,
)
from config_env import env

# Re-export the core catalog for legacy imports while keeping one source.
SUPPORTED_PROVIDERS = llm_model_catalog.SUPPORTED_PROVIDERS
OPEN_MODEL_PROVIDERS = llm_model_catalog.OPEN_MODEL_PROVIDERS
MODEL_CATALOG = llm_model_catalog.MODEL_CATALOG
KNOWN_MODELS = llm_model_catalog.KNOWN_MODELS


@dataclass(frozen=True)
class LLMSettings:
    """Confidential LLM configuration from .env."""

    provider: str = field(default_factory=lambda: env("LLM_PROVIDER").lower())
    deep_think_llm: str = field(default_factory=lambda: env("DEEP_THINK_LLM"))
    quick_think_llm: str = field(default_factory=lambda: env("QUICK_THINK_LLM"))
    llm_api_key: str = field(default_factory=lambda: env("LLM_API_KEY", ""))
    base_url: str = field(default_factory=lambda: env("LLM_BASE_URL", "").rstrip("/"))
    ollama_base_url: str = field(default_factory=lambda: env("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"))

    def __post_init__(self) -> None:
        if self.provider == "google":
            object.__setattr__(self, "deep_think_llm", self.deep_think_llm.lower())
            object.__setattr__(self, "quick_think_llm", self.quick_think_llm.lower())

    def backend_url(self) -> str | None:
        if self.base_url:
            return self.base_url
        if self.provider == "ollama":
            return self.ollama_base_url
        return None

    def metadata(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "models": {
                "quick_think": self.quick_think_llm,
                "deep_think": self.deep_think_llm,
            },
            "config_source": "env",
        }

    def tradingagents_overrides(
        self,
        *,
        analysis_depth: str = DEFAULT_ANALYSIS_DEPTH,
        response_detail: str = "full",
    ) -> dict[str, Any]:
        depth_config = ANALYSIS_DEPTH_CONFIG.get(analysis_depth, ANALYSIS_DEPTH_CONFIG[DEFAULT_ANALYSIS_DEPTH])
        retries = LLM_MAX_RETRIES
        budget = ANALYSIS_DEPTH_LLM_BUDGETS.get(analysis_depth, MAX_GEMINI_CALLS)
        return {
            "llm_provider": self.provider,
            "deep_think_llm": self.deep_think_llm,
            "quick_think_llm": self.quick_think_llm,
            "backend_url": self.backend_url(),
            "llm_api_key": self.llm_api_key,
            "llm": self.metadata(),
            "timeout": LLM_TIMEOUT_SECONDS,
            "pipeline_stage_timeout_seconds": PIPELINE_STAGE_TIMEOUT_SECONDS,
            "pipeline_llm_call_timeout_seconds": PIPELINE_LLM_CALL_TIMEOUT_SECONDS,
            "llm_max_retries": retries,
            "provider_sdk_max_retries": PROVIDER_SDK_MAX_RETRIES,
            "data_collection_workers": DATA_COLLECTION_WORKERS,
            "price_max_fallback_days": PRICE_MAX_FALLBACK_DAYS,
            "analyst_parallel_workers": ANALYST_PARALLEL_WORKERS,
            "tool_timeout_seconds": TOOL_TIMEOUT_SECONDS,
            "tool_max_retries": TOOL_MAX_RETRIES,
            "llm_retry_base_delay": LLM_RETRY_BASE_DELAY,
            "llm_retry_max_delay": LLM_RETRY_MAX_DELAY,
            "llm_429_max_wait_seconds": LLM_429_MAX_WAIT_SECONDS,
            "max_concurrent_llm_calls": MAX_CONCURRENT_LLM_CALLS,
            "cache_ttl_seconds": CACHE_TTL_SECONDS,
            "cache_max_entries": CACHE_MAX_ENTRIES,
            "llm_exact_cache_enabled": LLM_EXACT_CACHE_ENABLED,
            "llm_exact_cache_ttl_seconds": LLM_EXACT_CACHE_TTL_SECONDS,
            "llm_exact_cache_max_entries": LLM_EXACT_CACHE_MAX_ENTRIES,
            "llm_exact_cache_db_path": LLM_EXACT_CACHE_DB_PATH,
            "llm_semantic_cache_enabled": LLM_SEMANTIC_CACHE_ENABLED,
            "llm_semantic_cache_ttl_seconds": LLM_SEMANTIC_CACHE_TTL_SECONDS,
            "llm_semantic_cache_max_entries": LLM_SEMANTIC_CACHE_MAX_ENTRIES,
            "llm_semantic_cache_db_path": LLM_SEMANTIC_CACHE_DB_PATH,
            "llm_semantic_cache_similarity_threshold": LLM_SEMANTIC_CACHE_SIMILARITY_THRESHOLD,
            "llm_semantic_cache_targets": LLM_SEMANTIC_CACHE_TARGETS,
            "data_cache_backend": DATA_CACHE_BACKEND,
            "data_cache_db_path": DATA_CACHE_DB_PATH,
            "data_cache_ttl_seconds": DATA_CACHE_TTL_SECONDS,
            "data_cache_max_entries": DATA_CACHE_MAX_ENTRIES,
            "data_vendors": {
                "core_stock_apis": DATA_VENDOR_CORE_STOCK_APIS,
                "quote_data": DATA_VENDOR_QUOTE_DATA,
                "technical_indicators": DATA_VENDOR_TECHNICAL_INDICATORS,
                "fundamental_data": DATA_VENDOR_FUNDAMENTAL_DATA,
                "financial_statements": DATA_VENDOR_FINANCIAL_STATEMENTS,
                "news_data": DATA_VENDOR_NEWS_DATA,
                "global_news_data": DATA_VENDOR_GLOBAL_NEWS_DATA,
                "sentiment_data": DATA_VENDOR_SENTIMENT_DATA,
                "social_sentiment": DATA_VENDOR_SOCIAL_SENTIMENT,
                "event_data": DATA_VENDOR_EVENT_DATA,
                "analyst_rating": DATA_VENDOR_ANALYST_RATING,
                "insider_data": DATA_VENDOR_INSIDER_DATA,
                "forex_data": DATA_VENDOR_FOREX_DATA,
                "crypto_data": DATA_VENDOR_CRYPTO_DATA,
            },
            "news_min_relevance_score": DATA_VENDOR_NEWS_MIN_RELEVANCE_SCORE,
            "data_vendor_enable_multi_source_news": DATA_VENDOR_ENABLE_MULTI_SOURCE_NEWS,
            "data_vendor_enable_multi_source_price": DATA_VENDOR_ENABLE_MULTI_SOURCE_PRICE,
            "data_vendor_enable_finnhub_fallback": DATA_VENDOR_ENABLE_FINNHUB_FALLBACK,
            "data_vendor_enable_finnhub_enrichment": DATA_VENDOR_ENABLE_FINNHUB_ENRICHMENT,
            "data_vendor_require_source_metadata": DATA_VENDOR_REQUIRE_SOURCE_METADATA,
            "data_vendor_return_partial_on_failure": DATA_VENDOR_RETURN_PARTIAL_ON_FAILURE,
            "data_vendor_max_calls_per_analysis": DATA_VENDOR_MAX_CALLS_PER_ANALYSIS,
            "news": {
                "google_news_light_api_key": GOOGLE_NEWS_LIGHT_API_KEY,
                "marketaux_api_key": MARKETAUX_API_KEY,
                "newsdata_api_key": NEWSDATA_API_KEY,
                "strict_ai_analysis_mode": NEWS_STRICT_AI_ANALYSIS_MODE,
                "force_all_providers": NEWS_FORCE_ALL_PROVIDERS,
                "provider_priority": NEWS_PROVIDER_PRIORITY,
                "enabled_providers": NEWS_ENABLED_PROVIDERS,
                "default_window_days": NEWS_DEFAULT_WINDOW_DAYS,
                "max_articles_per_provider": NEWS_MAX_ARTICLES_PER_PROVIDER,
                "max_articles_for_prompt": NEWS_MAX_ARTICLES_FOR_PROMPT,
                "max_articles_for_ui": NEWS_MAX_ARTICLES_FOR_UI,
                "min_relevance_score": NEWS_MIN_RELEVANCE_SCORE,
                "prompt_min_relevance_score": NEWS_PROMPT_MIN_RELEVANCE_SCORE,
                "decision_min_relevance_score": NEWS_DECISION_MIN_RELEVANCE_SCORE,
                "rss_decision_min_relevance_score": NEWS_RSS_DECISION_MIN_RELEVANCE_SCORE,
                "rss_enabled": NEWS_RSS_ENABLED,
                "rss_max_feeds": NEWS_RSS_MAX_FEEDS,
                "rss_max_items_per_feed": NEWS_RSS_MAX_ITEMS_PER_FEED,
                "rss_include_trial_feeds": NEWS_RSS_INCLUDE_TRIAL_FEEDS,
                "rss_google_news_fallback_enabled": NEWS_RSS_GOOGLE_NEWS_FALLBACK_ENABLED,
                "rss_enabled_feed_ids": NEWS_RSS_ENABLED_FEED_IDS,
                "rss_disabled_feed_ids": NEWS_RSS_DISABLED_FEED_IDS,
                "rss_user_agent": NEWS_RSS_USER_AGENT,
                "cache_enabled": NEWS_CACHE_ENABLED,
                "cache_ttl_minutes": NEWS_CACHE_TTL_MINUTES,
                "cache_db_path": NEWS_CACHE_DB_PATH,
                "cache_max_entries": NEWS_CACHE_MAX_ENTRIES,
                "debug_raw_response": NEWS_DEBUG_RAW_RESPONSE,
                "log_provider_requests": NEWS_LOG_PROVIDER_REQUESTS,
                "vendor_timeout_seconds": NEWS_VENDOR_TIMEOUT_SECONDS,
                "vendor_max_retries": NEWS_VENDOR_MAX_RETRIES,
                "fetch_secondary_always": NEWS_FETCH_SECONDARY_ALWAYS,
                "secondary_fetch_threshold": NEWS_SECONDARY_FETCH_THRESHOLD,
                "enable_yfinance_fallback": NEWS_ENABLE_YFINANCE_FALLBACK,
            },
            "max_debate_rounds": DEFAULT_MAX_DEBATE_ROUNDS,
            "max_risk_discuss_rounds": MAX_RISK_DISCUSS_ROUNDS,
            "analysis_mode": ANALYSIS_MODE,
            "analysis_depth": analysis_depth,
            "analysis_depth_config": dict(depth_config),
            "analysis_depth_debate_rounds": depth_config["debate_rounds"],
            "analysis_depth_risk_rounds": depth_config["risk_rounds"],
            "response_detail": response_detail,
            "max_total_llm_calls": budget,
            "max_gemini_calls": budget,
        }


llm = LLMSettings()


def build_tradingagents_config(
    max_debate_rounds: int | None = None,
    *,
    analysis_depth: str | None = None,
    response_detail: str = "full",
) -> dict[str, Any]:
    from tradingagents.default_config import DEFAULT_CONFIG

    depth = analysis_depth or DEFAULT_ANALYSIS_DEPTH
    if depth not in ANALYSIS_DEPTHS:
        depth = DEFAULT_ANALYSIS_DEPTH
    if response_detail not in RESPONSE_DETAILS:
        response_detail = "full"

    config = DEFAULT_CONFIG.copy()
    overrides = llm.tradingagents_overrides(analysis_depth=depth, response_detail=response_detail)
    data_vendors = {
        **config.get("data_vendors", {}),
        **overrides.get("data_vendors", {}),
    }
    config.update(overrides)
    config["data_vendors"] = data_vendors
    depth_config = config.get("analysis_depth_config", {})
    depth_debate_rounds = int(depth_config.get("debate_rounds") or 1)
    depth_risk_rounds = int(depth_config.get("risk_rounds") or 1)
    requested_rounds = int(max_debate_rounds) if max_debate_rounds is not None else DEFAULT_MAX_DEBATE_ROUNDS
    effective_rounds = max(requested_rounds, depth_debate_rounds) if depth == "deep" else requested_rounds
    config["max_debate_rounds"] = effective_rounds
    config["max_risk_discuss_rounds"] = (
        max(effective_rounds, depth_risk_rounds) if depth == "deep" else effective_rounds
    )
    config["requested_max_debate_rounds"] = requested_rounds
    return config
