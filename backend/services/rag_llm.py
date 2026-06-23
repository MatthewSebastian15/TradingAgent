from __future__ import annotations

import logging
from typing import Any

from tradingagents.llm_clients.factory import create_llm_client

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a RAG assistant for TradingAgent application.

STRICT RULES:
1. Answer ONLY based on the provided context data. Do not use outside knowledge.
2. Do not invent prices, news, recommendations, or any facts not in the context.
3. If the context does not contain enough information, say so clearly.
4. Do not run new analysis or make new recommendations beyond what is in the context.
5. Always use the same language as the user's question.
6. At the end of each answer, briefly mention which data source you used
   (News / Market / AI Agent Analysis / Watchlist).
7. Keep answers concise and grounded in the data.

If the context is empty, reply:
"Tidak ada data yang relevan ditemukan di RAG Data Pool untuk pertanyaan ini."
"""


async def call_rag_llm(
    context: str,
    user_message: str,
    chat_history: list[dict[str, Any]],
) -> str:
    """Call LLM with strict RAG prompt via existing llm_clients factory."""
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    from config import RAG_CHATBOT_LLM_MODEL
    from config import llm as llm_config

    model = RAG_CHATBOT_LLM_MODEL or llm_config.quick_think_llm
    client = create_llm_client(
        provider=llm_config.provider,
        model=model,
        base_url=llm_config.base_url or None,
        api_key=llm_config.llm_api_key or None,
    )
    llm = client.get_llm()

    messages: list = [SystemMessage(content=_SYSTEM_PROMPT)]

    for entry in chat_history:
        role = str(entry.get("role", "")).lower()
        content = str(entry.get("content", ""))
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    context_block = f"\n\n--- CONTEXT DATA ---\n{context}\n--- END CONTEXT ---\n" if context else ""
    messages.append(HumanMessage(content=f"{context_block}\nUser question: {user_message}"))

    response = await llm.ainvoke(messages)
    content = response.content
    if isinstance(content, list):
        content = " ".join(
            item.get("text", "") if isinstance(item, dict) else str(item) for item in content
        )
    return str(content or "").strip()
