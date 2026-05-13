import os
from typing import Any, Optional

from langchain_openai import AzureChatOpenAI

from .base_client import BaseLLMClient, normalize_content
from .validators import validate_model
from tradingagents.dataflows.config import get_config
from tradingagents.utils_resilience import call_with_retry, call_with_timeout

_PASSTHROUGH_KWARGS = (
    "timeout", "max_retries", "api_key", "reasoning_effort",
    "callbacks", "http_client", "http_async_client",
)


class NormalizedAzureChatOpenAI(AzureChatOpenAI):
    """AzureChatOpenAI with normalized content output."""

    def invoke(self, input, config=None, **kwargs):
        cfg = get_config()
        service_name = f"llm:azure:{getattr(self, 'model_name', getattr(self, 'model', 'unknown'))}"

        def do_call():
            return call_with_timeout(
                lambda: normalize_content(AzureChatOpenAI.invoke(self, input, config, **kwargs)),
                timeout_seconds=int(cfg.get("timeout", 60)),
                service_name=service_name,
            )

        return call_with_retry(
            do_call,
            service_name=service_name,
            max_attempts=int(cfg.get("llm_max_retries", 3)),
            base_delay=float(cfg.get("llm_retry_base_delay", 1.5)),
            max_delay=float(cfg.get("llm_retry_max_delay", 30)),
            circuit_failure_threshold=int(cfg.get("circuit_breaker_failure_threshold", 5)),
            circuit_recovery_seconds=int(cfg.get("circuit_breaker_recovery_seconds", 60)),
        )


class AzureOpenAIClient(BaseLLMClient):
    """Client for Azure OpenAI deployments.

    Requires environment variables:
        AZURE_OPENAI_API_KEY: API key
        AZURE_OPENAI_ENDPOINT: Endpoint URL (e.g. https://<resource>.openai.azure.com/)
        AZURE_OPENAI_DEPLOYMENT_NAME: Deployment name
        OPENAI_API_VERSION: API version (e.g. 2025-03-01-preview)
    """

    def __init__(self, model: str, base_url: Optional[str] = None, **kwargs):
        super().__init__(model, base_url, **kwargs)

    def get_llm(self) -> Any:
        """Return configured AzureChatOpenAI instance."""
        self.warn_if_unknown_model()

        llm_kwargs = {
            "model": self.model,
            "azure_deployment": os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", self.model),
        }

        for key in _PASSTHROUGH_KWARGS:
            if key in self.kwargs:
                llm_kwargs[key] = self.kwargs[key]

        return NormalizedAzureChatOpenAI(**llm_kwargs)

    def validate_model(self) -> bool:
        """Azure accepts any deployed model name."""
        return True
