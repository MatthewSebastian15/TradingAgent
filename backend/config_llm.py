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
    DATA_VENDOR_CORE_STOCK_APIS,
    DATA_VENDOR_FUNDAMENTAL_DATA,
    DATA_VENDOR_NEWS_DATA,
    DATA_VENDOR_TECHNICAL_INDICATORS,
    DEFAULT_ANALYSIS_DEPTH,
    DEFAULT_MAX_DEBATE_ROUNDS,
    LLM_429_MAX_WAIT_SECONDS,
    LLM_MAX_RETRIES,
    LLM_RETRIES_BY_DEPTH,
    LLM_RETRY_BASE_DELAY,
    LLM_RETRY_MAX_DELAY,
    LLM_TIMEOUT_SECONDS,
    MAX_CONCURRENT_LLM_CALLS,
    MAX_GEMINI_CALLS,
    MAX_RISK_DISCUSS_ROUNDS,
    PROVIDER_SDK_MAX_RETRIES,
    RESPONSE_DETAILS,
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
    ollama_base_url: str = field(default_factory=lambda: env("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"))
    api_key: str = field(default_factory=lambda: env("API_KEY", ""))

    def __post_init__(self) -> None:
        if self.provider == "google":
            object.__setattr__(self, "deep_think_llm", self.deep_think_llm.lower())
            object.__setattr__(self, "quick_think_llm", self.quick_think_llm.lower())

    def backend_url(self) -> str | None:
        if self.provider == "ollama":
            return self.ollama_base_url
        return None

    def tradingagents_overrides(
        self,
        *,
        analysis_depth: str = DEFAULT_ANALYSIS_DEPTH,
        response_detail: str = "full",
    ) -> dict[str, Any]:
        depth_config = ANALYSIS_DEPTH_CONFIG.get(analysis_depth, ANALYSIS_DEPTH_CONFIG[DEFAULT_ANALYSIS_DEPTH])
        retries = LLM_RETRIES_BY_DEPTH.get(analysis_depth, LLM_MAX_RETRIES)
        budget = ANALYSIS_DEPTH_LLM_BUDGETS.get(analysis_depth, MAX_GEMINI_CALLS)
        return {
            "llm_provider": self.provider,
            "deep_think_llm": self.deep_think_llm,
            "quick_think_llm": self.quick_think_llm,
            "backend_url": self.backend_url(),
            "timeout": LLM_TIMEOUT_SECONDS,
            "llm_max_retries": retries,
            "provider_sdk_max_retries": PROVIDER_SDK_MAX_RETRIES,
            "data_collection_workers": DATA_COLLECTION_WORKERS,
            "analyst_parallel_workers": ANALYST_PARALLEL_WORKERS,
            "llm_retry_base_delay": LLM_RETRY_BASE_DELAY,
            "llm_retry_max_delay": LLM_RETRY_MAX_DELAY,
            "llm_429_max_wait_seconds": LLM_429_MAX_WAIT_SECONDS,
            "max_concurrent_llm_calls": MAX_CONCURRENT_LLM_CALLS,
            "cache_ttl_seconds": CACHE_TTL_SECONDS,
            "cache_max_entries": CACHE_MAX_ENTRIES,
            "data_cache_backend": DATA_CACHE_BACKEND,
            "data_cache_db_path": DATA_CACHE_DB_PATH,
            "data_cache_ttl_seconds": DATA_CACHE_TTL_SECONDS,
            "data_cache_max_entries": DATA_CACHE_MAX_ENTRIES,
            "data_vendors": {
                "core_stock_apis": DATA_VENDOR_CORE_STOCK_APIS,
                "technical_indicators": DATA_VENDOR_TECHNICAL_INDICATORS,
                "fundamental_data": DATA_VENDOR_FUNDAMENTAL_DATA,
                "news_data": DATA_VENDOR_NEWS_DATA,
            },
            "max_debate_rounds": DEFAULT_MAX_DEBATE_ROUNDS,
            "max_risk_discuss_rounds": MAX_RISK_DISCUSS_ROUNDS,
            "analysis_mode": ANALYSIS_MODE,
            "analysis_depth": analysis_depth,
            "analysis_depth_config": dict(depth_config),
            "analysis_depth_debate_rounds": depth_config["debate_rounds"],
            "analysis_depth_risk_rounds": depth_config["risk_rounds"],
            "response_detail": response_detail,
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
    config.update(llm.tradingagents_overrides(analysis_depth=depth, response_detail=response_detail))
    depth_config = config.get("analysis_depth_config", {})
    depth_debate_rounds = int(depth_config.get("debate_rounds") or 1)
    depth_risk_rounds = int(depth_config.get("risk_rounds") or 1)
    requested_rounds = int(max_debate_rounds) if max_debate_rounds is not None else DEFAULT_MAX_DEBATE_ROUNDS
    effective_rounds = max(requested_rounds, depth_debate_rounds) if depth == "deep" else requested_rounds
    config["max_debate_rounds"] = effective_rounds
    config["max_risk_discuss_rounds"] = max(effective_rounds, depth_risk_rounds) if depth == "deep" else effective_rounds
    config["requested_max_debate_rounds"] = requested_rounds
    return config
