from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_call_rag_llm_returns_string():
    from services.rag_llm import call_rag_llm

    mock_llm = MagicMock()
    mock_response = MagicMock()
    mock_response.content = "Berikut ringkasan..."
    mock_llm.ainvoke = AsyncMock(return_value=mock_response)
    mock_client = MagicMock()
    mock_client.get_llm.return_value = mock_llm

    with patch("services.rag_llm.create_llm_client", return_value=mock_client):
        result = await call_rag_llm(
            context="=== NEWS DATA ===\n[NEWS] Tesla Q2...",
            user_message="Ringkas berita Tesla",
            chat_history=[],
        )

    assert isinstance(result, str)
    assert len(result) > 0


@pytest.mark.asyncio
async def test_call_rag_llm_includes_chat_history():
    from services.rag_llm import call_rag_llm

    mock_llm = MagicMock()
    mock_response = MagicMock()
    mock_response.content = "Answer."
    mock_llm.ainvoke = AsyncMock(return_value=mock_response)
    mock_client = MagicMock()
    mock_client.get_llm.return_value = mock_llm

    history = [
        {"role": "user", "content": "Sebelumnya kita bicara tentang META."},
        {"role": "assistant", "content": "Ya, analisis META menunjukkan HOLD."},
    ]

    with patch("services.rag_llm.create_llm_client", return_value=mock_client):
        await call_rag_llm(
            context="=== ANALYSIS DATA ===",
            user_message="Apa risikonya?",
            chat_history=history,
        )

    messages = mock_llm.ainvoke.call_args[0][0]
    # SystemMessage + 2 history + 1 user question = at least 4
    assert len(messages) >= 4
