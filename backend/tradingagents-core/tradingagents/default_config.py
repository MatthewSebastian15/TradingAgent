import os

_TRADINGAGENTS_HOME = os.path.join(os.path.expanduser("~"), ".tradingagents")

DEFAULT_CONFIG = {
    "project_dir": os.path.abspath(os.path.join(os.path.dirname(__file__), ".")),
    "results_dir": os.getenv("TRADINGAGENTS_RESULTS_DIR", os.path.join(_TRADINGAGENTS_HOME, "logs")),
    "data_cache_dir": os.getenv("TRADINGAGENTS_CACHE_DIR", os.path.join(_TRADINGAGENTS_HOME, "cache")),
    "memory_log_path": os.getenv("TRADINGAGENTS_MEMORY_LOG_PATH", os.path.join(_TRADINGAGENTS_HOME, "memory", "trading_memory.md")),
    "memory_log_max_entries": None,

    # LLM settings — Ollama lokal dengan qwen3:4b
    "llm_provider": "google",
    "deep_think_llm": "gemini-2.5-flash-lite",
    "quick_think_llm": "gemini-2.5-flash-lite",

    # Ollama default berjalan di port 11434
    # "backend_url": "http://localhost:11434/v1",
    "backend_url": None,

    # Timeout dalam detik untuk setiap HTTP request ke Ollama.
    # Ini diteruskan langsung ke ChatOpenAI sebagai parameter "timeout",
    # sehingga jika model hang atau terlalu lambat, koneksi akan diputus
    # dari sisi HTTP dan tidak memblokir seluruh pipeline selamanya.
    # qwen3:4b pada hardware biasa biasanya selesai dalam 60-90 detik.
    # Naikkan ke 180 jika hardware kamu lambat, turunkan ke 60 jika cepat.
    "timeout": 60,
    
    "google_thinking_level": None,
    "openai_reasoning_effort": None,
    "anthropic_effort": None,
    "checkpoint_enabled": False,
    "output_language": "English",
    "max_debate_rounds": 1,
    "max_risk_discuss_rounds": 1,
    "max_recur_limit": 100,
    "data_vendors": {
        "core_stock_apis": "yfinance",
        "technical_indicators": "yfinance",
        "fundamental_data": "yfinance",
        "news_data": "yfinance",
    },
    "tool_vendors": {},
}