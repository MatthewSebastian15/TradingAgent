"""Centralized backend configuration.

Only confidential values (API keys, LLM provider, model names) come from .env.
Everything else is hardcoded here as named constants so there is one place to
change non-secret tunables without touching environment files.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# Load .env from backend/ (same folder as this file)
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# Supported providers and their required env key(s)
# ---------------------------------------------------------------------------
SUPPORTED_PROVIDERS: frozenset[str] = frozenset({
    "anthropic",
    "azure",
    "deepseek",
    "glm",
    "google",
    "ollama",
    "openai",
    "openrouter",
    "qwen",
    "xai",
})

# Providers that accept any model string without hard validation
OPEN_MODEL_PROVIDERS: frozenset[str] = frozenset({"ollama", "openrouter", "azure"})

# Model catalog: known models per provider and usage mode
# quick_think_llm → fast/cheap agents
# deep_think_llm  → Research Manager and Portfolio Manager
MODEL_CATALOG: dict[str, dict[str, list[tuple[str, str]]]] = {
    "openai": {
        "quick": [
            ("GPT-4o Mini - Fast, strong coding and tool use", "gpt-4o-mini"),
            ("GPT-4o - Latest frontier, 128k context", "gpt-4o"),
            ("GPT-4 Turbo - High capability", "gpt-4-turbo"),
        ],
        "deep": [
            ("GPT-4o - Latest frontier, 128k context", "gpt-4o"),
            ("GPT-4 Turbo - High capability", "gpt-4-turbo"),
            ("o1 - Strong reasoning", "o1"),
            ("o1 Mini - Fast reasoning", "o1-mini"),
        ],
    },
    "anthropic": {
        "quick": [
            ("Claude Sonnet 4.6 - Best speed and intelligence balance", "claude-sonnet-4-6"),
            ("Claude Haiku 4.5 - Fast, near-instant responses", "claude-haiku-4-5"),
            ("Claude Sonnet 4.5 - Agents and coding", "claude-sonnet-4-5"),
        ],
        "deep": [
            ("Claude Opus 4.6 - Most intelligent, agents and coding", "claude-opus-4-6"),
            ("Claude Opus 4.5 - Premium, max intelligence", "claude-opus-4-5"),
            ("Claude Sonnet 4.6 - Best speed and intelligence balance", "claude-sonnet-4-6"),
            ("Claude Sonnet 4.5 - Agents and coding", "claude-sonnet-4-5"),
        ],
    },
    "google": {
        "quick": [
            ("Gemini 2.5 Flash - Balanced, stable", "gemini-2.5-flash"),
            ("Gemini 2.5 Flash Lite - Fast, low-cost", "gemini-2.5-flash-lite"),
            ("Gemini 2.0 Flash - Previous generation fast", "gemini-2.0-flash"),
        ],
        "deep": [
            ("Gemini 2.5 Pro - Stable pro model", "gemini-2.5-pro"),
            ("Gemini 2.5 Flash - Balanced, stable", "gemini-2.5-flash"),
            ("Gemini 2.0 Flash - Previous generation fast", "gemini-2.0-flash"),
        ],
    },
    "xai": {
        "quick": [
            ("Grok Beta - Speed optimized", "grok-beta"),
            ("Grok 2 - Balanced", "grok-2"),
        ],
        "deep": [
            ("Grok 2 - Balanced", "grok-2"),
            ("Grok Beta - Speed optimized", "grok-beta"),
        ],
    },
    "deepseek": {
        "quick": [
            ("DeepSeek Chat - V3 fast model", "deepseek-chat"),
            ("Custom model ID", "custom"),
        ],
        "deep": [
            ("DeepSeek Reasoner - Thinking model", "deepseek-reasoner"),
            ("DeepSeek Chat - V3 fast model", "deepseek-chat"),
            ("Custom model ID", "custom"),
        ],
    },
    "qwen": {
        "quick": [
            ("Qwen Plus", "qwen-plus"),
            ("Qwen Turbo", "qwen-turbo"),
            ("Custom model ID", "custom"),
        ],
        "deep": [
            ("Qwen Max", "qwen-max"),
            ("Qwen Plus", "qwen-plus"),
            ("Custom model ID", "custom"),
        ],
    },
    "glm": {
        "quick": [
            ("GLM-4 Flash", "glm-4-flash"),
            ("Custom model ID", "custom"),
        ],
        "deep": [
            ("GLM-4 Plus", "glm-4-plus"),
            ("GLM-4 Flash", "glm-4-flash"),
            ("Custom model ID", "custom"),
        ],
    },
    "ollama": {
        "quick": [
            ("Qwen3:latest (8B, local)", "qwen3:latest"),
            ("Llama3:latest (8B, local)", "llama3:latest"),
        ],
        "deep": [
            ("Llama3:latest (8B, local)", "llama3:latest"),
            ("Qwen3:latest (8B, local)", "qwen3:latest"),
        ],
    },
}

# Known model names per provider (derived from catalog, used for soft validation)
KNOWN_MODELS: dict[str, list[str]] = {
    provider: sorted({value for options in modes.values() for _, value in options})
    for provider, modes in MODEL_CATALOG.items()
}


# ---------------------------------------------------------------------------
# Non-secret tunables (hardcoded, not from .env)
# ---------------------------------------------------------------------------

# Ports
BACKEND_PORT = 8000
FRONTEND_PORT = 3000

# CORS
CORS_ORIGINS: list[str] = [
    f"http://localhost:{FRONTEND_PORT}",
    "http://localhost:5173",  # Vite default fallback
]

# App
APP_NAME = "TradingAgents API"
APP_ENV = os.getenv("APP_ENV", "development")  # kept as env for docker override

# Pipeline tunables
PIPELINE_TIMEOUT_SECONDS = 600
PROCESS_POOL_WORKERS = min(4, os.cpu_count() or 2)
DEFAULT_MAX_DEBATE_ROUNDS = 3
MAX_RISK_DISCUSS_ROUNDS = 1
ANALYSIS_MODE = "balanced"
MAX_GEMINI_CALLS = 9

# Rate limiting
REQUEST_RATE_LIMIT_PER_MINUTE = 20
STREAM_RATE_LIMIT_PER_MINUTE = 8
MAX_CONCURRENT_REQUESTS_PER_KEY = 2
MAX_CONCURRENT_STREAMS_PER_KEY = 1
REQUIRE_API_KEY_FOR_RATE_LIMIT = False

# LLM resilience
LLM_TIMEOUT_SECONDS = 60
LLM_MAX_RETRIES = 1
LLM_RETRY_BASE_DELAY = 1.5
LLM_RETRY_MAX_DELAY = 30

# Cache
CACHE_TTL_SECONDS = 900
CACHE_MAX_ENTRIES = 512

# Circuit breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
CIRCUIT_BREAKER_RECOVERY_SECONDS = 60

# Tool
TOOL_TIMEOUT_SECONDS = 45
TOOL_MAX_RETRIES = 3

# Debate
DEBATE_MIN_ROUNDS = 2
DEBATE_CONFIDENCE_GAP = 0.18
DEBATE_CONSENSUS_THRESHOLD = 0.72
RISK_MIN_ROUNDS = 2
RISK_CONSENSUS_THRESHOLD = 0.72
ADAPTIVE_DEBATE_ENABLED = True


# ---------------------------------------------------------------------------
# Confidential settings loaded from .env
# ---------------------------------------------------------------------------

def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@dataclass(frozen=True)
class LLMSettings:
    """Confidential LLM configuration from .env."""
    provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "google").lower())
    deep_think_llm: str = field(default_factory=lambda: _env("DEEP_THINK_LLM", _env("DEEP_MODEL", "gemini-2.5-flash")))
    quick_think_llm: str = field(default_factory=lambda: _env("QUICK_THINK_LLM", _env("QUICK_MODEL", "gemini-2.5-flash")))
    ollama_base_url: str = field(default_factory=lambda: _env("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"))
    api_key: str = field(default_factory=lambda: _env("API_KEY", ""))

    def backend_url(self) -> str | None:
        if self.provider == "ollama":
            return self.ollama_base_url
        return None

    def tradingagents_overrides(self) -> dict[str, Any]:
        return {
            "llm_provider": self.provider,
            "deep_think_llm": self.deep_think_llm,
            "quick_think_llm": self.quick_think_llm,
            "backend_url": self.backend_url(),
            "timeout": LLM_TIMEOUT_SECONDS,
            "llm_max_retries": LLM_MAX_RETRIES,
            "cache_ttl_seconds": CACHE_TTL_SECONDS,
            "cache_max_entries": CACHE_MAX_ENTRIES,
            "max_debate_rounds": DEFAULT_MAX_DEBATE_ROUNDS,
            "max_risk_discuss_rounds": MAX_RISK_DISCUSS_ROUNDS,
            "analysis_mode": ANALYSIS_MODE,
            "max_gemini_calls": MAX_GEMINI_CALLS,
        }


llm = LLMSettings()


# ---------------------------------------------------------------------------
# Config builder
# ---------------------------------------------------------------------------

def build_tradingagents_config(max_debate_rounds: int | None = None) -> dict[str, Any]:
    from tradingagents.default_config import DEFAULT_CONFIG

    config = DEFAULT_CONFIG.copy()
    config.update(llm.tradingagents_overrides())
    if max_debate_rounds is not None:
        config["max_debate_rounds"] = max_debate_rounds
        config["max_risk_discuss_rounds"] = max_debate_rounds
    return config


# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------

def _has_any_env(*names: str) -> bool:
    return any(bool(os.getenv(n)) for n in names)


def _validate_writable_dir(path: str, key: str, errors: list[str]) -> None:
    try:
        directory = Path(path).expanduser()
        directory.mkdir(parents=True, exist_ok=True)
        test_file = directory / ".write_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
    except Exception:
        errors.append(f"Directory for {key} is not writable.")


PROVIDER_KEY_REQUIREMENTS: dict[str, tuple[tuple[str, ...], str]] = {
    "google":      (("GOOGLE_API_KEY", "GEMINI_API_KEY"), "GOOGLE_API_KEY or GEMINI_API_KEY is required when LLM_PROVIDER=google."),
    "openai":      (("OPENAI_API_KEY",),                  "OPENAI_API_KEY is required when LLM_PROVIDER=openai."),
    "anthropic":   (("ANTHROPIC_API_KEY",),               "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic."),
    "deepseek":    (("DEEPSEEK_API_KEY",),                "DEEPSEEK_API_KEY is required when LLM_PROVIDER=deepseek."),
    "xai":         (("XAI_API_KEY",),                     "XAI_API_KEY is required when LLM_PROVIDER=xai."),
    "qwen":        (("DASHSCOPE_API_KEY", "QWEN_API_KEY"), "DASHSCOPE_API_KEY or QWEN_API_KEY is required when LLM_PROVIDER=qwen."),
    "glm":         (("ZHIPU_API_KEY", "GLM_API_KEY"),     "ZHIPU_API_KEY or GLM_API_KEY is required when LLM_PROVIDER=glm."),
    "openrouter":  (("OPENROUTER_API_KEY",),              "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter."),
}


def validate_startup_config() -> list[str]:
    errors: list[str] = []

    provider = llm.provider
    if provider not in SUPPORTED_PROVIDERS:
        errors.append(f"LLM_PROVIDER must be one of: {', '.join(sorted(SUPPORTED_PROVIDERS))}.")

    if provider in PROVIDER_KEY_REQUIREMENTS:
        env_names, message = PROVIDER_KEY_REQUIREMENTS[provider]
        if not _has_any_env(*env_names):
            errors.append(message)

    if provider == "azure":
        if not os.getenv("AZURE_OPENAI_API_KEY"):
            errors.append("AZURE_OPENAI_API_KEY is required when LLM_PROVIDER=azure.")
        if not os.getenv("AZURE_OPENAI_ENDPOINT"):
            errors.append("AZURE_OPENAI_ENDPOINT is required when LLM_PROVIDER=azure.")
        if not os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME") and not llm.deep_think_llm:
            errors.append("AZURE_OPENAI_DEPLOYMENT_NAME or DEEP_THINK_LLM is required when LLM_PROVIDER=azure.")

    if not llm.deep_think_llm:
        errors.append("DEEP_THINK_LLM must not be empty.")
    if not llm.quick_think_llm:
        errors.append("QUICK_THINK_LLM must not be empty.")

    if ANALYSIS_MODE not in {"balanced", "classic"}:
        errors.append("ANALYSIS_MODE must be either balanced or classic.")

    try:
        config = build_tradingagents_config()
        _validate_writable_dir(config.get("results_dir", ""), "results_dir", errors)
        _validate_writable_dir(config.get("data_cache_dir", ""), "data_cache_dir", errors)
    except Exception as exc:
        errors.append(f"TradingAgents config could not be loaded: {exc}")

    return errors


# ---------------------------------------------------------------------------
# Legacy shim — keeps old import paths working during transition
# ---------------------------------------------------------------------------
class _BackendSettingsShim:
    """Compatibility shim for code that still references `settings.*`."""
    app_name = APP_NAME
    environment = APP_ENV
    cors_origins = CORS_ORIGINS
    pipeline_timeout_seconds = PIPELINE_TIMEOUT_SECONDS
    process_pool_workers = PROCESS_POOL_WORKERS
    default_max_debate_rounds = DEFAULT_MAX_DEBATE_ROUNDS
    max_risk_discuss_rounds = MAX_RISK_DISCUSS_ROUNDS
    analysis_mode = ANALYSIS_MODE
    max_gemini_calls = MAX_GEMINI_CALLS
    request_rate_limit_per_minute = REQUEST_RATE_LIMIT_PER_MINUTE
    stream_rate_limit_per_minute = STREAM_RATE_LIMIT_PER_MINUTE
    max_concurrent_requests_per_key = MAX_CONCURRENT_REQUESTS_PER_KEY
    max_concurrent_streams_per_key = MAX_CONCURRENT_STREAMS_PER_KEY
    require_api_key_for_rate_limit = REQUIRE_API_KEY_FOR_RATE_LIMIT
    llm_timeout_seconds = LLM_TIMEOUT_SECONDS
    llm_max_retries = LLM_MAX_RETRIES
    cache_ttl_seconds = CACHE_TTL_SECONDS
    cache_max_entries = CACHE_MAX_ENTRIES

    @property
    def llm_provider(self): return llm.provider
    @property
    def deep_think_llm(self): return llm.deep_think_llm
    @property
    def quick_think_llm(self): return llm.quick_think_llm
    @property
    def ollama_base_url(self): return llm.ollama_base_url
    @property
    def api_key(self): return llm.api_key

    def tradingagents_overrides(self): return llm.tradingagents_overrides()


settings = _BackendSettingsShim()
