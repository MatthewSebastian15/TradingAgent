from __future__ import annotations


def test_rag_chatbot_defaults_are_importable(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_SKIP_DOTENV", "true")
    import importlib

    import config_defaults as d

    importlib.reload(d)
    assert d.RAG_CHATBOT_ENABLED is True
    assert d.RAG_CHATBOT_LLM_MODEL == ""
    assert d.RAG_CHATBOT_MAX_CONTEXT_ARTICLES == 15
    assert d.RAG_CHATBOT_MAX_CONTEXT_ANALYSES == 5
    assert d.RAG_CHATBOT_NEWS_POOL_TTL_SECONDS == 300
    assert d.RAG_CHATBOT_MARKET_POOL_TTL_SECONDS == 120
    assert d.RAG_CHATBOT_ECON_POOL_TTL_SECONDS == 1800
    assert d.RAG_CHATBOT_CHAT_TIMEOUT_SECONDS == 60
