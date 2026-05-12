import logging
import re
import time
from typing import Any, Optional

from langchain_google_genai import ChatGoogleGenerativeAI

from .base_client import BaseLLMClient, normalize_content
from .validators import validate_model

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
        last_exc = None

        for attempt in range(1, MAX_RETRIES_429 + 1):
            try:
                return normalize_content(super().invoke(input, config, **kwargs))

            except Exception as exc:
                error_str = str(exc)

                # Tangani khusus error 429 RESOURCE_EXHAUSTED
                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    delay = _extract_retry_delay(error_str)
                    logger.warning(
                        "Gemini 429 RESOURCE_EXHAUSTED (attempt %d/%d). "
                        "Menunggu %.0f detik sebelum retry...",
                        attempt, MAX_RETRIES_429, delay,
                    )

                    if attempt < MAX_RETRIES_429:
                        time.sleep(delay)
                        last_exc = exc
                        continue
                    else:
                        logger.error(
                            "Gemini 429 masih terjadi setelah %d retry. Menyerah.",
                            MAX_RETRIES_429,
                        )
                        raise

                # Error lain (bukan 429): langsung lempar tanpa retry
                raise

        # Seharusnya tidak pernah sampai sini
        raise last_exc


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