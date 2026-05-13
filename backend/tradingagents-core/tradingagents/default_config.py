import os

_TRADINGAGENTS_HOME = os.path.join(os.path.expanduser("~"), ".tradingagents")

DEFAULT_CONFIG = {
    "project_dir": os.path.abspath(os.path.join(os.path.dirname(__file__), ".")),
    "results_dir": os.getenv("TRADINGAGENTS_RESULTS_DIR", os.path.join(_TRADINGAGENTS_HOME, "logs")),
    "data_cache_dir": os.getenv("TRADINGAGENTS_CACHE_DIR", os.path.join(_TRADINGAGENTS_HOME, "cache")),
    "memory_log_path": os.getenv("TRADINGAGENTS_MEMORY_LOG_PATH", os.path.join(_TRADINGAGENTS_HOME, "memory", "trading_memory.md")),
    "memory_log_max_entries": int(os.getenv("TRADINGAGENTS_MEMORY_MAX_ENTRIES", "300")),
    "memory_log_ttl_days": int(os.getenv("TRADINGAGENTS_MEMORY_TTL_DAYS", "90")),

    # LLM settings — Ollama lokal dengan qwen3:4b
    "llm_provider": "google",
    "deep_think_llm": "gemini-2.5-flash",
    "quick_think_llm": "gemini-2.5-flash",

    # Ollama default berjalan di port 11434
    # "backend_url": "http://localhost:11434/v1",
    "backend_url": None,

    # Timeout dalam detik untuk setiap HTTP request ke Ollama.
    # Ini diteruskan langsung ke ChatOpenAI sebagai parameter "timeout",
    # sehingga jika model hang atau terlalu lambat, koneksi akan diputus
    # dari sisi HTTP dan tidak memblokir seluruh pipeline selamanya.
    # qwen3:4b pada hardware biasa biasanya selesai dalam 60-90 detik.
    # Naikkan ke 180 jika hardware kamu lambat, turunkan ke 60 jika cepat.
    "timeout": int(os.getenv("LLM_TIMEOUT_SECONDS", "60")),
    "llm_max_retries": int(os.getenv("LLM_MAX_RETRIES", "3")),
    "llm_retry_base_delay": float(os.getenv("LLM_RETRY_BASE_DELAY", "1.5")),
    "llm_retry_max_delay": float(os.getenv("LLM_RETRY_MAX_DELAY", "30")),
    "circuit_breaker_failure_threshold": int(os.getenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5")),
    "circuit_breaker_recovery_seconds": int(os.getenv("CIRCUIT_BREAKER_RECOVERY_SECONDS", "60")),
    "tool_timeout_seconds": int(os.getenv("TOOL_TIMEOUT_SECONDS", "45")),
    "tool_max_retries": int(os.getenv("TOOL_MAX_RETRIES", "3")),
    "cache_ttl_seconds": int(os.getenv("CACHE_TTL_SECONDS", "900")),
    "cache_max_entries": int(os.getenv("CACHE_MAX_ENTRIES", "512")),
    "parallel_analysts": os.getenv("PARALLEL_ANALYSTS", "true").lower() == "true",
    
    "google_thinking_level": None,
    "openai_reasoning_effort": None,
    "anthropic_effort": None,
    "checkpoint_enabled": False,
    "output_language": "English",
    "max_debate_rounds": int(os.getenv("MAX_DEBATE_ROUNDS", "3")),
    "max_risk_discuss_rounds": int(os.getenv("MAX_RISK_DISCUSS_ROUNDS", "3")),
    "adaptive_debate_enabled": os.getenv("ADAPTIVE_DEBATE_ENABLED", "true").lower() == "true",
    "debate_min_rounds": int(os.getenv("DEBATE_MIN_ROUNDS", "2")),
    "debate_confidence_gap": float(os.getenv("DEBATE_CONFIDENCE_GAP", "0.18")),
    "debate_consensus_threshold": float(os.getenv("DEBATE_CONSENSUS_THRESHOLD", "0.72")),
    "risk_min_rounds": int(os.getenv("RISK_MIN_ROUNDS", "2")),
    "risk_consensus_threshold": float(os.getenv("RISK_CONSENSUS_THRESHOLD", "0.72")),
    "max_recur_limit": 100,
    "data_vendors": {
        "core_stock_apis": "yfinance",
        "technical_indicators": "yfinance",
        "fundamental_data": "yfinance",
        "news_data": "yfinance",
    },
    "tool_vendors": {},
}