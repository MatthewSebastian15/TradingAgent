import os

_TRADINGAGENTS_HOME = os.path.join(os.path.expanduser("~"), ".tradingagents")


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


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
    # Pipeline
    "parallel_analysts": True,
    "analysis_mode": "balanced",
    "max_gemini_calls": 9,
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
    "data_vendors": {
        "core_stock_apis": _env("DATA_VENDOR_CORE_STOCK_APIS") or "yfinance,alpha_vantage",
        "technical_indicators": _env("DATA_VENDOR_TECHNICAL_INDICATORS") or "yfinance,alpha_vantage",
        "fundamental_data": _env("DATA_VENDOR_FUNDAMENTAL_DATA") or "yfinance,alpha_vantage",
        "news_data": _env("DATA_VENDOR_NEWS_DATA") or "yfinance,alpha_vantage",
    },
    "tool_vendors": {},
}
