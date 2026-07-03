import pytest
from langchain_core.messages import AIMessage

from tradingagents.llm_clients import anthropic_client as client_module
from tradingagents.llm_clients.anthropic_client import AnthropicClient, NormalizedChatAnthropic

KNOWN_MODEL = "claude-sonnet-4-6"


def _client(model=KNOWN_MODEL, **kwargs):
    return AnthropicClient(model, api_key="test-placeholder", **kwargs)


def test_get_llm_builds_configured_instance():
    llm = _client(timeout=30, max_tokens=1024, unknown_kwarg="dropped").get_llm()
    assert isinstance(llm, NormalizedChatAnthropic)
    assert llm.model == KNOWN_MODEL
    assert llm.max_tokens == 1024
    # non-passthrough kwargs never reach the SDK client
    assert not hasattr(llm, "unknown_kwarg")


def test_validate_model_against_catalog():
    assert _client().validate_model() is True
    assert _client(model="gpt-4o").validate_model() is False


def test_unknown_model_warns_but_continues():
    with pytest.warns(RuntimeWarning, match="not in the known model list"):
        llm = _client(model="claude-imaginary-9").get_llm()
    assert llm.model == "claude-imaginary-9"


def test_invoke_normalizes_block_content_and_wraps_retry(monkeypatch):
    captured = {}

    def fake_retry(func, **kwargs):
        captured.update(kwargs)
        return func()

    blocks = [
        {"type": "thinking", "thinking": "internal reasoning"},
        {"type": "text", "text": "final"},
        {"type": "text", "text": "answer"},
    ]
    monkeypatch.setattr(client_module, "call_with_retry", fake_retry)
    monkeypatch.setattr(
        client_module.ChatAnthropic,
        "invoke",
        lambda self, input, config=None, **kwargs: AIMessage(content=blocks),
    )

    response = _client().get_llm().invoke("hello")
    assert response.content == "final\nanswer"  # thinking block dropped
    assert captured["service_name"] == f"llm:anthropic:{KNOWN_MODEL}"
    # retry budget comes from runtime config; only the wiring is under test
    assert captured["max_attempts"] >= 1


def test_invoke_propagates_provider_error(monkeypatch):
    monkeypatch.setattr(client_module, "call_with_retry", lambda func, **kwargs: func())

    def boom(self, input, config=None, **kwargs):
        raise RuntimeError("anthropic api error")

    monkeypatch.setattr(client_module.ChatAnthropic, "invoke", boom)
    with pytest.raises(RuntimeError, match="anthropic api error"):
        _client().get_llm().invoke("hello")
