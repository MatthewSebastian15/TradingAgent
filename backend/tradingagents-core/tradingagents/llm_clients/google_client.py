import logging
import re
import time
from typing import Any, Optional

from langchain_google_genai import ChatGoogleGenerativeAI

from .base_client import BaseLLMClient, normalize_content
from .validators import validate_model
from tradingagents.dataflows.config import get_config
from tradingagents.utils_resilience import call_with_retry, call_with_timeout, limit_concurrency

logger = logging.getLogger(__name__)

# Maksimal berapa kali retry saat kena 429 sebelum menyerah
MAX_RETRIES_429 = 3

# Delay default (detik) jika API tidak memberikan retryDelay
DEFAULT_RETRY_DELAY = 60


def _extract_retry_delay(error_message: str) -> float:
    """Ambil nilai retryDelay dari pesan error Gemini (dalam detik).

    Gemini mengirim pesan seperti 'Please retry in 52.25s'.
    Jika tidak ditemukan, kembalikan DEFAULT_RETRY_DELAY.
    """
    match = re.search(r"retry in\s+([\d.]+)s", str(error_message))
    if match:
        return float(match.group(1)) + 5  # tambah 5 detik buffer
    return DEFAULT_RETRY_DELAY


class NormalizedChatGoogleGenerativeAI(ChatGoogleGenerativeAI):
    """ChatGoogleGenerativeAI dengan normalized content output dan retry 429.

    Gemini Free Tier membatasi 250.000 token per menit. Pipeline multi-agent
    ini bisa melewati batas itu dalam satu run. Kelas ini menangkap error 429
    secara otomatis, menunggu sesuai retryDelay dari Gemini, lalu mencoba lagi
    sampai MAX_RETRIES_429 kali sebelum menyerah dan melempar exception.
    """

    def invoke(self, input, config=None, **kwargs):
        cfg = get_config()
        service_name = f"llm:google:{getattr(self, 'model', 'unknown')}"

        def do_call():
            concurrency_limit = int(cfg.get("max_concurrent_llm_calls", 3))
            with limit_concurrency("llm:google", concurrency_limit):
                return call_with_timeout(
                    lambda: normalize_content(ChatGoogleGenerativeAI.invoke(self, input, config, **kwargs)),
                    timeout_seconds=int(cfg.get("timeout", 60)),
                    service_name=service_name,
                )

        try:
            return call_with_retry(
                do_call,
                service_name=service_name,
                max_attempts=int(cfg.get("llm_max_retries", MAX_RETRIES_429)),
                base_delay=float(cfg.get("llm_retry_base_delay", 1.5)),
                max_delay=float(cfg.get("llm_retry_max_delay", 30)),
                circuit_failure_threshold=int(cfg.get("circuit_breaker_failure_threshold", 5)),
                circuit_recovery_seconds=int(cfg.get("circuit_breaker_recovery_seconds", 60)),
            )
        except Exception as exc:
            error_str = str(exc)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                raw_delay = _extract_retry_delay(error_str)
                max_wait = float(cfg.get("llm_429_max_wait_seconds", 20))
                delay = min(raw_delay, max_wait)
                logger.warning(
                    "Gemini rate limit. Respecting retryDelay %.0fs before final retry (capped at %.0fs)",
                    raw_delay,
                    delay,
                )
                time.sleep(delay)
                return do_call()
            raise


class GoogleClient(BaseLLMClient):
    """Client for Google Gemini models."""

    def __init__(self, model: str, base_url: Optional[str] = None, **kwargs):
        super().__init__(model, base_url, **kwargs)

    def get_llm(self) -> Any:
        """Return configured ChatGoogleGenerativeAI instance."""
        self.warn_if_unknown_model()
        llm_kwargs = {"model": self.model}

        if self.base_url:
            llm_kwargs["base_url"] = self.base_url

        for key in ("timeout", "max_retries", "callbacks", "http_client", "http_async_client"):
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        # Unified api_key maps to provider-specific google_api_key
        google_api_key = self.kwargs.get("api_key") or self.kwargs.get("google_api_key")
        if google_api_key:
            llm_kwargs["google_api_key"] = google_api_key

        # Map thinking_level to appropriate API param based on model
        thinking_level = self.kwargs.get("thinking_level")
        if thinking_level:
            model_lower = self.model.lower()
            if "gemini-3" in model_lower:
                if "pro" in model_lower and thinking_level == "minimal":
                    thinking_level = "low"
                llm_kwargs["thinking_level"] = thinking_level
            else:
                llm_kwargs["thinking_budget"] = -1 if thinking_level == "high" else 0

        return NormalizedChatGoogleGenerativeAI(**llm_kwargs)

    def validate_model(self) -> bool:
        """Validate model for Google."""
        return validate_model("google", self.model)