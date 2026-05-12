"""Shared helpers for invoking an agent with structured output and a graceful fallback.

The Portfolio Manager, Trader, and Research Manager all follow the same
canonical pattern:

1. At agent creation, wrap the LLM with ``with_structured_output(Schema)``
   so the model returns a typed Pydantic instance. If the provider does
   not support structured output (rare; mostly older Ollama models), the
   wrap is skipped and the agent uses free-text generation instead.
2. At invocation, run the structured call and render the result back to
   markdown. If the structured call itself fails for any reason
   (malformed JSON from a weak model, timeout, or transient provider issue),
   fall back to a plain ``llm.invoke`` so the pipeline never blocks.

PERUBAHAN vs original:
- Timeout sekarang ditangani di level HTTP oleh ChatOpenAI melalui key
  "timeout" di DEFAULT_CONFIG. Nilai ini diteruskan ke httpx session, jadi
  jika Ollama hang, httpx.ReadTimeout akan dilempar dan ditangkap di sini
  sebagai Exception biasa, lalu dilanjutkan ke free-text fallback.
- Free-text fallback juga menangkap semua Exception termasuk timeout, dan
  mengembalikan string placeholder agar pipeline tidak berhenti total.
- Tidak menggunakan ThreadPoolExecutor karena timeout sudah berjalan di
  dalam LLM call sendiri -- tidak perlu watchdog thread terpisah.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def bind_structured(llm: Any, schema: type[T], agent_name: str) -> Optional[Any]:
    """Return ``llm.with_structured_output(schema)`` or ``None`` if unsupported.

    Logs a warning when the binding fails so the user understands the agent
    will use free-text generation for every call instead of one-shot fallback.
    """
    try:
        return llm.with_structured_output(schema)
    except (NotImplementedError, AttributeError) as exc:
        logger.warning(
            "%s: provider does not support with_structured_output (%s); "
            "falling back to free-text generation",
            agent_name, exc,
        )
        return None


def invoke_structured_or_freetext(
    structured_llm: Optional[Any],
    plain_llm: Any,
    prompt: Any,
    render: Callable[[T], str],
    agent_name: str,
) -> str:
    """Run the structured call and render to markdown; fall back to free-text on any failure.

    Timeout diatur melalui key "timeout" di DEFAULT_CONFIG yang diteruskan ke
    ChatOpenAI. Ketika Ollama tidak merespons dalam batas waktu itu, httpx
    akan raise ReadTimeout, yang ditangkap di sini sebagai Exception biasa.

    Alur:
        1. Coba structured output. Jika berhasil, render dan return.
        2. Jika structured gagal (apapun alasannya: JSON invalid, timeout,
           model tidak support), coba free-text dengan plain_llm.
        3. Jika free-text juga gagal, return placeholder string agar graph
           tetap berjalan dan tidak hang di node ini selamanya.
    """
    # --- Attempt 1: structured output ---
    if structured_llm is not None:
        try:
            result = structured_llm.invoke(prompt)
            return render(result)
        except Exception as exc:
            logger.warning(
                "%s: structured-output invocation failed (%s); retrying as free text",
                agent_name, exc,
            )

    # --- Attempt 2: free-text fallback ---
    try:
        response = plain_llm.invoke(prompt)
        return response.content
    except Exception as exc:
        logger.error(
            "%s: free-text fallback also failed (%s). Returning placeholder so graph can continue.",
            agent_name, exc,
        )
        return (
            f"**Rating**: Hold\n\n"
            f"**Executive Summary**: {agent_name} gagal menghasilkan analisis. "
            f"Error: {exc}. Periksa apakah Ollama berjalan dan model tersedia.\n\n"
            f"**Investment Thesis**: Analisis tidak tersedia karena error pada model."
        )