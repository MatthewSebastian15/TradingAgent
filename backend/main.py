from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.analysis import router as analysis_router
from dotenv import load_dotenv
import os
import sys
import logging

logger = logging.getLogger(__name__)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BASE_DIR, ".env"))

app = FastAPI(title="TradingAgents API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix="/api")


@app.on_event("startup")
async def validate_config():
    """Validate critical config and environment variables before accepting requests.

    Fails fast at startup instead of surfacing errors 30-60 seconds into a
    live pipeline run. Logs a clear message for each missing value so the
    operator knows exactly what to fix.
    """
    from tradingagents.default_config import DEFAULT_CONFIG

    errors = []

    provider = DEFAULT_CONFIG.get("llm_provider", "").lower()

    # --- Provider-specific API key checks ---
    if provider == "google":
        if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GEMINI_API_KEY"):
            errors.append(
                "llm_provider is 'google' but neither GOOGLE_API_KEY nor "
                "GEMINI_API_KEY is set in the environment."
            )

    elif provider == "openai":
        if not os.getenv("OPENAI_API_KEY"):
            errors.append(
                "llm_provider is 'openai' but OPENAI_API_KEY is not set."
            )

    elif provider == "anthropic":
        if not os.getenv("ANTHROPIC_API_KEY"):
            errors.append(
                "llm_provider is 'anthropic' but ANTHROPIC_API_KEY is not set."
            )

    elif provider == "ollama":
        backend_url = DEFAULT_CONFIG.get("backend_url") or "http://localhost:11434"
        import httpx
        try:
            resp = httpx.get(f"{backend_url}/api/tags", timeout=5)
            resp.raise_for_status()
        except Exception as exc:
            errors.append(
                f"llm_provider is 'ollama' but cannot reach backend at "
                f"{backend_url}: {exc}. Is Ollama running?"
            )

    elif not provider:
        errors.append("DEFAULT_CONFIG['llm_provider'] is not set.")

    # --- Model names ---
    if not DEFAULT_CONFIG.get("deep_think_llm"):
        errors.append("DEFAULT_CONFIG['deep_think_llm'] is not set.")
    if not DEFAULT_CONFIG.get("quick_think_llm"):
        errors.append("DEFAULT_CONFIG['quick_think_llm'] is not set.")

    # --- Required directories must be writable ---
    for key in ("results_dir", "data_cache_dir"):
        path = DEFAULT_CONFIG.get(key, "")
        try:
            os.makedirs(path, exist_ok=True)
            test_file = os.path.join(path, ".write_test")
            with open(test_file, "w") as f:
                f.write("ok")
            os.remove(test_file)
        except Exception as exc:
            errors.append(f"Directory '{path}' (config key '{key}') is not writable: {exc}")

    if errors:
        for msg in errors:
            logger.critical("STARTUP CONFIG ERROR: %s", msg)
        logger.critical(
            "%d config error(s) found. Fix them and restart the server.", len(errors)
        )
        sys.exit(1)

    logger.info(
        "Startup validation passed. Provider: %s | deep: %s | quick: %s",
        provider,
        DEFAULT_CONFIG.get("deep_think_llm"),
        DEFAULT_CONFIG.get("quick_think_llm"),
    )