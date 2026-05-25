"""Centralized backend configuration.

Confidential values (API keys, LLM provider, model names) come from .env.
Most non-secret tunables live here as named defaults; deployment-sensitive
settings such as APP_ENV, CORS_ORIGINS, and API-key enforcement can be
overridden through environment variables.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from tradingagents.llm_clients import model_catalog as llm_model_catalog

# Load .env from backend/ (same folder as this file)
BASE_DIR = Path(__file__).resolve().parent


def _env_bool_raw(value: str | None, default: bool = False) -> bool:
    if value is None or not value.strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _should_load_dotenv() -> bool:
    """Load local .env for app runtime, but keep tests hermetic."""
    if _env_bool_raw(os.getenv("TRADINGAGENTS_SKIP_DOTENV"), False):
        return False
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    return True


if _should_load_dotenv():
    load_dotenv(BASE_DIR / ".env")

logger = logging.getLogger(__name__)

# Re-export the core catalog for legacy imports while keeping one source.
SUPPORTED_PROVIDERS = llm_model_catalog.SUPPORTED_PROVIDERS
OPEN_MODEL_PROVIDERS = llm_model_catalog.OPEN_MODEL_PROVIDERS
MODEL_CATALOG = llm_model_catalog.MODEL_CATALOG
KNOWN_MODELS = llm_model_catalog.KNOWN_MODELS


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    logger.warning("Invalid boolean value for %s=%r; using default %s.", name, raw, default)
    return default


def _env_int(name: str, default: int, *, min_value: int | None = None) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    try:
        value = int(raw.strip())
    except ValueError:
        logger.warning("Invalid integer value for %s=%r; using default %s.", name, raw, default)
        return default

    if min_value is not None and value < min_value:
        logger.warning("%s=%r is below minimum %s; using default %s.", name, raw, min_value, default)
        return default

    return value


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if raw is None:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]

# ---------------------------------------------------------------------------
# Non-secret tunables and deployment defaults
# ---------------------------------------------------------------------------

# App
APP_NAME = "TradingAgents API"
APP_ENV = _env("APP_ENV", "production").lower()  # secure default unless explicitly set to development/test
_IS_PRODUCTION = APP_ENV == "production"

# Ports
BACKEND_PORT = 8000
FRONTEND_PORT = 3000

# CORS. Production defaults to same-origin only; set CORS_ORIGINS to a
# comma-separated allowlist when the frontend is deployed on another origin.
_DEFAULT_CORS_ORIGINS: list[str] = [] if _IS_PRODUCTION else [
    f"http://localhost:{FRONTEND_PORT}",
    "http://localhost:5173",  # Vite default fallback
]
CORS_ORIGINS: list[str] = _env_list("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)

# Pipeline tunables
PIPELINE_TIMEOUT_SECONDS = _env_int("PIPELINE_TIMEOUT_SECONDS", 600, min_value=1)
PREFLIGHT_TIMEOUT_SECONDS = min(_env_int("PREFLIGHT_TIMEOUT_SECONDS", 30, min_value=1), PIPELINE_TIMEOUT_SECONDS)
PROCESS_POOL_WORKERS = min(_env_int("PROCESS_POOL_WORKERS", 2, min_value=1), os.cpu_count() or 2)
PROCESS_POOL_MAX_TASKS_PER_CHILD = _env_int("PROCESS_POOL_MAX_TASKS_PER_CHILD", 1, min_value=1)
DATA_COLLECTION_WORKERS = _env_int("DATA_COLLECTION_WORKERS", 6, min_value=1)
ANALYST_PARALLEL_WORKERS = _env_int("ANALYST_PARALLEL_WORKERS", 3, min_value=1)
DEFAULT_MAX_DEBATE_ROUNDS = _env_int("DEFAULT_MAX_DEBATE_ROUNDS", 3, min_value=1)
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
REQUEST_RATE_LIMIT_PER_MINUTE = _env_int("REQUEST_RATE_LIMIT_PER_MINUTE", 20, min_value=1)
STREAM_RATE_LIMIT_PER_MINUTE = _env_int("STREAM_RATE_LIMIT_PER_MINUTE", 8, min_value=1)
MAX_CONCURRENT_REQUESTS_PER_KEY = _env_int("MAX_CONCURRENT_REQUESTS_PER_KEY", 2, min_value=1)
MAX_CONCURRENT_STREAMS_PER_KEY = _env_int("MAX_CONCURRENT_STREAMS_PER_KEY", 1, min_value=1)
REQUEST_BODY_MAX_BYTES = _env_int("REQUEST_BODY_MAX_BYTES", 64 * 1024, min_value=1024)
# Production defaults to API-key-only rate limiting. Local/test environments
# still allow anonymous clients, rate-limited by direct client IP.
REQUIRE_API_KEY_FOR_RATE_LIMIT = _env_bool("REQUIRE_API_KEY_FOR_RATE_LIMIT", _IS_PRODUCTION)
if _IS_PRODUCTION and not REQUIRE_API_KEY_FOR_RATE_LIMIT:
    logger.warning(
        "APP_ENV=production but REQUIRE_API_KEY_FOR_RATE_LIMIT is disabled; "
        "anonymous clients will be accepted and rate-limited by IP only."
    )

# LLM resilience
LLM_TIMEOUT_SECONDS = _env_int("LLM_TIMEOUT_SECONDS", 60, min_value=1)
LLM_MAX_RETRIES = _env_int("LLM_MAX_RETRIES", 2, min_value=1)
PROVIDER_SDK_MAX_RETRIES = _env_int("PROVIDER_SDK_MAX_RETRIES", 0, min_value=0)
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
CACHE_TTL_SECONDS = _env_int("CACHE_TTL_SECONDS", 900, min_value=1)
CACHE_MAX_ENTRIES = _env_int("CACHE_MAX_ENTRIES", 512, min_value=1)
ANALYSIS_RESULT_CACHE_TTL_SECONDS = 60 * 60 * 8
ANALYSIS_RESULT_CACHE_MAX_ENTRIES = 256
ANALYSIS_JOB_TTL_SECONDS = 60 * 60
ANALYSIS_JOB_MAX_ENTRIES = 256
ANALYSIS_JOB_MAX_ACTIVE = min(_env_int("ANALYSIS_JOB_MAX_ACTIVE", 32, min_value=1), ANALYSIS_JOB_MAX_ENTRIES)
ANALYSIS_JOB_EVENT_REPLAY_LIMIT = _env_int("ANALYSIS_JOB_EVENT_REPLAY_LIMIT", 500, min_value=1)
DATA_CACHE_BACKEND = "sqlite"
DATA_CACHE_DB_PATH = str(BASE_DIR / ".cache" / "market_data.sqlite3")
DATA_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS
DATA_CACHE_MAX_ENTRIES = CACHE_MAX_ENTRIES

# Circuit breaker
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
CIRCUIT_BREAKER_RECOVERY_SECONDS = 60

# Tool
TOOL_TIMEOUT_SECONDS = _env_int("TOOL_TIMEOUT_SECONDS", 45, min_value=1)
TOOL_MAX_RETRIES = _env_int("TOOL_MAX_RETRIES", 2, min_value=1)

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

@dataclass(frozen=True)
class LLMSettings:
    """Confidential LLM configuration from .env."""
    provider: str = field(default_factory=lambda: _env("LLM_PROVIDER").lower())
    deep_think_llm: str = field(default_factory=lambda: _env("DEEP_THINK_LLM"))
    quick_think_llm: str = field(default_factory=lambda: _env("QUICK_THINK_LLM"))
    ollama_base_url: str = field(default_factory=lambda: _env("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/"))
    api_key: str = field(default_factory=lambda: _env("API_KEY", ""))

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
            "max_debate_rounds": DEFAULT_MAX_DEBATE_ROUNDS,
            "max_risk_discuss_rounds": MAX_RISK_DISCUSS_ROUNDS,
            "analysis_mode": ANALYSIS_MODE,
            "analysis_depth": analysis_depth,
            "response_detail": response_detail,
            "max_gemini_calls": budget,
        }


llm = LLMSettings()


# ---------------------------------------------------------------------------
# Config builder
# ---------------------------------------------------------------------------

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
    "qwen":        (("DASHSCOPE_API_KEY", "QWEN_API_KEY"), "DASHSCOPE_API_KEY or QWEN_API_KEY is required when LLM_PROVIDER=qwen."),
    "glm":         (("ZHIPU_API_KEY", "GLM_API_KEY"),     "ZHIPU_API_KEY or GLM_API_KEY is required when LLM_PROVIDER=glm."),
    "openrouter":  (("OPENROUTER_API_KEY",),              "OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter."),
}


def validate_startup_config() -> list[str]:
    errors: list[str] = []

    provider = llm.provider
    if not provider:
        errors.append("LLM_PROVIDER must not be empty.")
    elif provider not in SUPPORTED_PROVIDERS:
        errors.append(f"LLM_PROVIDER must be one of: {', '.join(sorted(SUPPORTED_PROVIDERS))}.")

    if provider in PROVIDER_KEY_REQUIREMENTS:
        env_names, message = PROVIDER_KEY_REQUIREMENTS[provider]
        if not _has_any_env(*env_names):
            errors.append(message)

    if not llm.deep_think_llm:
        errors.append("DEEP_THINK_LLM must not be empty.")
    if not llm.quick_think_llm:
        errors.append("QUICK_THINK_LLM must not be empty.")
    if REQUIRE_API_KEY_FOR_RATE_LIMIT and not llm.api_key:
        errors.append("API_KEY is required when REQUIRE_API_KEY_FOR_RATE_LIMIT=true.")

    if ANALYSIS_MODE not in {"balanced", "classic"}:
        errors.append("ANALYSIS_MODE must be either balanced or classic.")
    if DEFAULT_ANALYSIS_DEPTH not in ANALYSIS_DEPTHS:
        errors.append("DEFAULT_ANALYSIS_DEPTH must be one of: fast, balanced, deep.")

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
    preflight_timeout_seconds = PREFLIGHT_TIMEOUT_SECONDS
    process_pool_workers = PROCESS_POOL_WORKERS
    data_collection_workers = DATA_COLLECTION_WORKERS
    analyst_parallel_workers = ANALYST_PARALLEL_WORKERS
    default_max_debate_rounds = DEFAULT_MAX_DEBATE_ROUNDS
    max_risk_discuss_rounds = MAX_RISK_DISCUSS_ROUNDS
    analysis_mode = ANALYSIS_MODE
    default_analysis_depth = DEFAULT_ANALYSIS_DEPTH
    analysis_depth_llm_budgets = ANALYSIS_DEPTH_LLM_BUDGETS
    max_gemini_calls = MAX_GEMINI_CALLS
    request_rate_limit_per_minute = REQUEST_RATE_LIMIT_PER_MINUTE
    stream_rate_limit_per_minute = STREAM_RATE_LIMIT_PER_MINUTE
    max_concurrent_requests_per_key = MAX_CONCURRENT_REQUESTS_PER_KEY
    max_concurrent_streams_per_key = MAX_CONCURRENT_STREAMS_PER_KEY
    request_body_max_bytes = REQUEST_BODY_MAX_BYTES
    require_api_key_for_rate_limit = REQUIRE_API_KEY_FOR_RATE_LIMIT
    llm_timeout_seconds = LLM_TIMEOUT_SECONDS
    llm_max_retries = LLM_MAX_RETRIES
    provider_sdk_max_retries = PROVIDER_SDK_MAX_RETRIES
    max_concurrent_llm_calls = MAX_CONCURRENT_LLM_CALLS
    cache_ttl_seconds = CACHE_TTL_SECONDS
    cache_max_entries = CACHE_MAX_ENTRIES
    analysis_result_cache_ttl_seconds = ANALYSIS_RESULT_CACHE_TTL_SECONDS
    analysis_result_cache_max_entries = ANALYSIS_RESULT_CACHE_MAX_ENTRIES

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
