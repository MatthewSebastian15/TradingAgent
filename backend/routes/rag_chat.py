from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Request
from pydantic import Field

from config import RAG_CHATBOT_CHAT_TIMEOUT_SECONDS, RAG_CHATBOT_ENABLED
from errors import BadRequestError
from rate_limiter import limit_request, request_policy
from schemas import ApiSchema
from services.rag_llm import call_rag_llm, translate_message
from services.rag_pool import get_pool_status
from services.rag_service import build_context, check_scope, detect_intent

logger = logging.getLogger(__name__)
router = APIRouter(tags=["rag-chatbot"])

_OUT_OF_SCOPE = (
    "This question is outside the permitted context. The chatbot can only answer "
    "based on stored News, Market, Watchlist data, and AI Agent analysis results."
)
_NO_DATA = "Tidak ada data yang relevan ditemukan di RAG Data Pool untuk pertanyaan ini."


class _ChatHistoryItem(ApiSchema):
    role: str
    content: str


class RagChatRequest(ApiSchema):
    message: str = Field(..., min_length=1, max_length=2000)
    context_filter: str = Field(default="all")
    chat_history: list[_ChatHistoryItem] = Field(default_factory=list)
    watchlist_context: dict[str, Any] | None = Field(default=None)


class RagChatResponse(ApiSchema):
    answer: str
    out_of_scope: bool
    pool_used: list[str]
    sources: list[dict[str, Any]]


@router.get("/rag/pool/status")
async def rag_pool_status(request: Request) -> dict[str, Any]:
    async with limit_request(request, request_policy()):
        return await get_pool_status()


@router.post("/rag/chat", response_model=RagChatResponse)
async def rag_chat(body: RagChatRequest, request: Request) -> RagChatResponse:
    if not RAG_CHATBOT_ENABLED:
        raise BadRequestError("RAG Chatbot is not enabled.")

    async with limit_request(request, request_policy()):
        message = body.message.strip()
        context_filter = str(body.context_filter or "all").lower()
        if context_filter not in {"all", "news", "market", "analysis", "watchlist"}:
            context_filter = "all"
        history = [{"role": h.role, "content": h.content} for h in body.chat_history[-10:]]
        watchlist_ctx = body.watchlist_context

        if not check_scope(message):
            try:
                warning = await asyncio.wait_for(
                    translate_message(_OUT_OF_SCOPE, message),
                    timeout=RAG_CHATBOT_CHAT_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                warning = _OUT_OF_SCOPE
            return RagChatResponse(answer=warning, out_of_scope=True, pool_used=[], sources=[])

        intent = detect_intent(message, context_filter)

        try:
            context_str, sources = await asyncio.wait_for(
                build_context(message, intent, watchlist_context=watchlist_ctx),
                timeout=RAG_CHATBOT_CHAT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning("RAG context build timed out: %s", message[:80])
            context_str, sources = "", []

        if not context_str.strip():
            return RagChatResponse(
                answer=_NO_DATA, out_of_scope=False, pool_used=intent, sources=[]
            )

        try:
            answer = await asyncio.wait_for(
                call_rag_llm(context_str, message, history),
                timeout=RAG_CHATBOT_CHAT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning("RAG LLM timed out: %s", message[:80])
            answer = "Waktu tunggu habis. Coba lagi."

        return RagChatResponse(answer=answer, out_of_scope=False, pool_used=intent, sources=sources)
