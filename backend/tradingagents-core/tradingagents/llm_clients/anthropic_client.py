from typing import Any, Optional

from langchain_anthropic import ChatAnthropic

from .base_client import BaseLLMClient, normalize_content
from .validators import validate_model
from tradingagents.dataflows.config import get_config
from tradingagents.utils_resilience import call_with_retry

_PASSTHROUGH_KWARGS = (
    "timeout", "max_retries", "api_key", "max_tokens",
    "callbacks", "http_client", "http_async_client", "effort",
)


class NormalizedChatAnthropic(ChatAnthropic):
    """ChatAnthropic with normalized content output.

    Claude models with extended thinking or tool use return content as a
    list of typed blocks. This normalizes to string for consistent
    downstream handling.
    """

    def invoke(self, input, config=None, **kwargs):
        cfg = get_config()
        service_name = f"llm:anthropic:{getattr(self, 'model', 'unknown')}"

        def do_call():
            return normalize_content(ChatAnthropic.invoke(self, input, config, **kwargs))

        return call_with_retry(
            do_call,
            service_name=service_name,
            max_attempts=int(cfg.get("llm_max_retries", 3)),
            base_delay=float(cfg.get("llm_retry_base_delay", 1.5)),
            max_delay=float(cfg.get("llm_retry_max_delay", 30)),
            circuit_failure_threshold=int(cfg.get("circuit_breaker_failure_threshold", 5)),
            circuit_recovery_seconds=int(cfg.get("circuit_breaker_recovery_seconds", 60)),
        )


class AnthropicClient(BaseLLMClient):
    """Client for Anthropic Claude models."""

    def __init__(self, model: str, base_url: Optional[str] = None, **kwargs):
        super().__init__(model, base_url, **kwargs)

    def get_llm(self) -> Any:
        """Return configured ChatAnthropic instance."""
        self.warn_if_unknown_model()
        llm_kwargs = {"model": self.model}

        if self.base_url:
            llm_kwargs["base_url"] = self.base_url

        for key in _PASSTHROUGH_KWARGS:
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        return NormalizedChatAnthropic(**llm_kwargs)

    def validate_model(self) -> bool:
        """Validate model for Anthropic."""
        return validate_model("anthropic", self.model)
