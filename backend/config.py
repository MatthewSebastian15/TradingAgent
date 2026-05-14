"""Centralized backend configuration and startup validation."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_int(name: str, default: int, minimum: int | None = None, maximum: int | None = None) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw is not None else default
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer.") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}.")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} must be <= {maximum}.")
    return value


def _get_float(name: str, default: float, minimum: float | None = None) -> float:
    raw = os.getenv(name)
    try:
        value = float(raw) if raw is not None else default
    except ValueError as exc:
        raise ValueError(f"{name} must be a number.") from exc
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}.")
    return value


def _csv(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class TimingConfig:
    market_analyst: int = field(default_factory=lambda: _get_int("TIMING_MARKET_ANALYST_SECONDS", 20, 0))
    news_analyst: int = field(default_factory=lambda: _get_int("TIMING_NEWS_ANALYST_SECONDS", 45, 0))
    fundamentals: int = field(default_factory=lambda: _get_int("TIMING_FUNDAMENTALS_SECONDS", 70, 0))
    bull_researcher: int = field(default_factory=lambda: _get_int("TIMING_BULL_RESEARCHER_SECONDS", 90, 0))
    bear_researcher: int = field(default_factory=lambda: _get_int("TIMING_BEAR_RESEARCHER_SECONDS", 110, 0))
    research_manager: int = field(default_factory=lambda: _get_int("TIMING_RESEARCH_MANAGER_SECONDS", 125, 0))
    trader: int = field(default_factory=lambda: _get_int("TIMING_TRADER_SECONDS", 135, 0))
    risk_analysts: int = field(default_factory=lambda: _get_int("TIMING_RISK_ANALYSTS_SECONDS", 160, 0))

    def as_thresholds(self) -> list[tuple[str, int]]:
        return [
            ("market_analyst", self.market_analyst),
            ("news_analyst", self.news_analyst),
            ("fundamentals", self.fundamentals),
            ("bull_researcher", self.bull_researcher),
            ("bear_researcher", self.bear_researcher),
            ("research_manager", self.research_manager),
            ("trader", self.trader),
            ("risk_analysts", self.risk_analysts),
            ("portfolio_manager", 999_999),
        ]


@dataclass(frozen=True)
class BackendSettings:
    app_name: str = os.getenv("APP_NAME", "TradingAgents API")
    environment: str = os.getenv("APP_ENV", "development")
    cors_origins: list[str] = field(default_factory=lambda: _csv("CORS_ORIGINS", "*"))

    llm_provider: str = os.getenv("LLM_PROVIDER", "google").strip().lower()
    deep_think_llm: str = os.getenv("DEEP_THINK_LLM", os.getenv("DEEP_MODEL", "gemini-2.5-flash-lite")).strip()
    quick_think_llm: str = os.getenv("QUICK_THINK_LLM", os.getenv("QUICK_MODEL", "gemini-2.5-flash-lite")).strip()
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", os.getenv("BACKEND_URL", "http://localhost:11434")).rstrip("/")

    pipeline_timeout_seconds: int = field(default_factory=lambda: _get_int("PIPELINE_TIMEOUT_SECONDS", 600, 30))
    process_pool_workers: int = field(default_factory=lambda: _get_int("PROCESS_POOL_WORKERS", min(4, os.cpu_count() or 2), 1, 16))
    default_max_debate_rounds: int = field(default_factory=lambda: _get_int("MAX_DEBATE_ROUNDS", 1, 1, 5))
    max_risk_discuss_rounds: int = field(default_factory=lambda: _get_int("MAX_RISK_DISCUSS_ROUNDS", 1, 1, 5))
    analysis_mode: str = os.getenv("ANALYSIS_MODE", "balanced").strip().lower()
    max_gemini_calls: int = field(default_factory=lambda: _get_int("MAX_GEMINI_CALLS", 9, 1, 26))

    request_rate_limit_per_minute: int = field(default_factory=lambda: _get_int("REQUEST_RATE_LIMIT_PER_MINUTE", 20, 1))
    stream_rate_limit_per_minute: int = field(default_factory=lambda: _get_int("STREAM_RATE_LIMIT_PER_MINUTE", 8, 1))
    max_concurrent_requests_per_key: int = field(default_factory=lambda: _get_int("MAX_CONCURRENT_REQUESTS_PER_KEY", 2, 1))
    max_concurrent_streams_per_key: int = field(default_factory=lambda: _get_int("MAX_CONCURRENT_STREAMS_PER_KEY", 1, 1))
    require_api_key_for_rate_limit: bool = field(default_factory=lambda: _get_bool("REQUIRE_API_KEY_FOR_RATE_LIMIT", False))

    llm_timeout_seconds: int = field(default_factory=lambda: _get_int("LLM_TIMEOUT_SECONDS", 60, 5))
    llm_max_retries: int = field(default_factory=lambda: _get_int("LLM_MAX_RETRIES", 1, 0, 10))
    cache_ttl_seconds: int = field(default_factory=lambda: _get_int("CACHE_TTL_SECONDS", 900, 0))
    cache_max_entries: int = field(default_factory=lambda: _get_int("CACHE_MAX_ENTRIES", 512, 1))

    timing: TimingConfig = field(default_factory=TimingConfig)

    def tradingagents_overrides(self) -> dict[str, Any]:
        backend_url = None
        if self.llm_provider == "ollama":
            backend_url = self.ollama_base_url

        return {
            "llm_provider": self.llm_provider,
            "deep_think_llm": self.deep_think_llm,
            "quick_think_llm": self.quick_think_llm,
            "backend_url": backend_url,
            "timeout": self.llm_timeout_seconds,
            "llm_max_retries": self.llm_max_retries,
            "cache_ttl_seconds": self.cache_ttl_seconds,
            "cache_max_entries": self.cache_max_entries,
            "max_debate_rounds": self.default_max_debate_rounds,
            "max_risk_discuss_rounds": self.max_risk_discuss_rounds,
            "analysis_mode": self.analysis_mode,
            "max_gemini_calls": self.max_gemini_calls,
        }


settings = BackendSettings()


def _has_any_env(names: tuple[str, ...]) -> bool:
    return any(bool(os.getenv(name)) for name in names)


def _validate_writable_dir(path: str, key: str, errors: list[str]) -> None:
    try:
        directory = Path(path).expanduser()
        directory.mkdir(parents=True, exist_ok=True)
        test_file = directory / ".write_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
    except Exception as exc:
        errors.append(f"Directory for {key} is not writable.")


def build_tradingagents_config(max_debate_rounds: int | None = None) -> dict[str, Any]:
    from tradingagents.default_config import DEFAULT_CONFIG

    config = DEFAULT_CONFIG.copy()
    config.update(settings.tradingagents_overrides())
    if max_debate_rounds is not None:
        config["max_debate_rounds"] = max_debate_rounds
        config["max_risk_discuss_rounds"] = max_debate_rounds
    return config


def validate_startup_config() -> list[str]:
    errors: list[str] = []

    provider = settings.llm_provider
    supported = {"google", "openai", "anthropic", "ollama"}
    if provider not in supported:
        errors.append(f"LLM_PROVIDER must be one of: {', '.join(sorted(supported))}.")

    if provider == "google" and not _has_any_env(("GOOGLE_API_KEY", "GEMINI_API_KEY")):
        errors.append("GOOGLE_API_KEY or GEMINI_API_KEY is required when LLM_PROVIDER=google.")
    if provider == "openai" and not os.getenv("OPENAI_API_KEY"):
        errors.append("OPENAI_API_KEY is required when LLM_PROVIDER=openai.")
    if provider == "anthropic" and not os.getenv("ANTHROPIC_API_KEY"):
        errors.append("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic.")

    if not settings.deep_think_llm:
        errors.append("DEEP_THINK_LLM must not be empty.")
    if not settings.quick_think_llm:
        errors.append("QUICK_THINK_LLM must not be empty.")

    if settings.analysis_mode not in {"balanced", "classic"}:
        errors.append("ANALYSIS_MODE must be either balanced or classic.")

    if settings.analysis_mode == "balanced" and settings.max_gemini_calls != 9:
        errors.append("Balanced mode is implemented as a fixed 9 Gemini-call pipeline. Set MAX_GEMINI_CALLS=9 or ANALYSIS_MODE=classic.")

    try:
        config = build_tradingagents_config()
        _validate_writable_dir(config.get("results_dir", ""), "results_dir", errors)
        _validate_writable_dir(config.get("data_cache_dir", ""), "data_cache_dir", errors)
    except Exception as exc:
        errors.append(f"TradingAgents config could not be loaded: {exc}")

    return errors
