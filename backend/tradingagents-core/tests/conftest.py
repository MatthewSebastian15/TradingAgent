"""Shared pytest fixtures that prevent CI hangs when API keys are absent."""

import os
from unittest.mock import MagicMock, patch

import pytest
from tradingagents.llm_clients.model_catalog import MODEL_CATALOG


def pytest_configure(config):
    for marker in ("unit", "integration", "smoke"):
        config.addinivalue_line("markers", f"{marker}: {marker}-level tests")


_API_KEY_ENV_VARS = (
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "DASHSCOPE_API_KEY",
    "ZHIPU_API_KEY",
    "OPENROUTER_API_KEY",
    "ALPHA_VANTAGE_API_KEY",
)


@pytest.fixture(autouse=True)
def _dummy_api_keys(monkeypatch):
    for env_var in _API_KEY_ENV_VARS:
        monkeypatch.setenv(env_var, os.environ.get(env_var, "placeholder"))
    monkeypatch.setenv("LLM_PROVIDER", os.environ.get("LLM_PROVIDER", "google"))
    monkeypatch.setenv("QUICK_THINK_LLM", os.environ.get("QUICK_THINK_LLM", MODEL_CATALOG["google"]["quick"][0][1]))
    monkeypatch.setenv("DEEP_THINK_LLM", os.environ.get("DEEP_THINK_LLM", MODEL_CATALOG["google"]["deep"][0][1]))


@pytest.fixture()
def mock_llm_client():
    client = MagicMock()
    client.get_llm.return_value = MagicMock()
    with patch(
        "tradingagents.llm_clients.factory.create_llm_client",
        return_value=client,
    ):
        yield client
