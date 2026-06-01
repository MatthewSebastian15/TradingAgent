"""Shared pytest fixtures that prevent CI hangs when API keys are absent."""

import os
from unittest.mock import MagicMock, patch

import pytest

_API_KEY_ENV_VARS = (
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
    "ALPHA_VANTAGE_API_KEY",
    "FINNHUB_API_KEY",
    "MARKETAUX_API_KEY",
    "NEWSDATA_API_KEY",
)
_API_KEY_PLACEHOLDER = "test-placeholder"

os.environ["TRADINGAGENTS_SKIP_DOTENV"] = "true"
for _env_var in _API_KEY_ENV_VARS:
    os.environ[_env_var] = _API_KEY_PLACEHOLDER

from tradingagents.llm_clients.model_catalog import MODEL_CATALOG  # noqa: E402

_GOOGLE_QUICK_LLM = MODEL_CATALOG["google"]["quick"][0][1]
_GOOGLE_DEEP_LLM = MODEL_CATALOG["google"]["deep"][0][1]
os.environ["LLM_PROVIDER"] = "google"
os.environ["QUICK_THINK_LLM"] = _GOOGLE_QUICK_LLM
os.environ["DEEP_THINK_LLM"] = _GOOGLE_DEEP_LLM


def pytest_configure(config):
    for marker in ("unit", "integration", "smoke"):
        config.addinivalue_line("markers", f"{marker}: {marker}-level tests")


@pytest.fixture(autouse=True)
def _dummy_api_keys(monkeypatch):
    for env_var in _API_KEY_ENV_VARS:
        monkeypatch.setenv(env_var, _API_KEY_PLACEHOLDER)
    monkeypatch.setenv("TRADINGAGENTS_SKIP_DOTENV", "true")
    monkeypatch.setenv("LLM_PROVIDER", "google")
    monkeypatch.setenv("QUICK_THINK_LLM", _GOOGLE_QUICK_LLM)
    monkeypatch.setenv("DEEP_THINK_LLM", _GOOGLE_DEEP_LLM)


@pytest.fixture()
def mock_llm_client():
    client = MagicMock()
    client.get_llm.return_value = MagicMock()
    with patch(
        "tradingagents.llm_clients.factory.create_llm_client",
        return_value=client,
    ):
        yield client
