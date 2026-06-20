from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

_usage_lock = threading.Lock()
_daily_usage: dict[str, dict] = defaultdict(lambda: {
    "calls": 0,
    "estimated_tokens": 0,
    "total_latency_ms": 0.0,
})


@dataclass
class LLMUsageRecord:
    agent_name: str
    provider: str
    model: str
    schema_name: str
    prompt_chars: int
    estimated_input_tokens: int
    output_tokens: int | None = None
    cached_input_tokens: int | None = None
    latency_ms: float | None = None
    cache_layer: str | None = None
    cache_hit: bool = False
    fallback_used: bool = False
    parse_success: bool = False
    error: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def estimate_tokens_from_text(text: str) -> int:
    return max(1, len(text or "") // 4)


def get_llm_identity(llm: Any) -> tuple[str, str]:
    provider = (
        getattr(llm, "provider", None) or getattr(llm, "_llm_type", None) or llm.__class__.__name__
    )
    model = (
        getattr(llm, "model_name", None)
        or getattr(llm, "model", None)
        or getattr(llm, "model_id", None)
        or "unknown"
    )
    return str(provider).lower(), str(model)


def extract_usage_metadata(result: Any) -> dict[str, Any]:
    """Best-effort extraction across LangChain/OpenAI/Gemini response objects."""
    metadata: dict[str, Any] = {}

    response_metadata = getattr(result, "response_metadata", None)
    if isinstance(response_metadata, dict):
        metadata.update(response_metadata)

    usage_metadata = getattr(result, "usage_metadata", None)
    if isinstance(usage_metadata, dict):
        metadata["usage_metadata"] = usage_metadata

    additional_kwargs = getattr(result, "additional_kwargs", None)
    if isinstance(additional_kwargs, dict):
        metadata["additional_kwargs"] = additional_kwargs

    return metadata


def normalize_usage_numbers(metadata: dict[str, Any]) -> tuple[int | None, int | None]:
    """Return output tokens and cached input tokens when providers expose them."""
    output_tokens = None
    cached_input_tokens = None

    usage = metadata.get("usage_metadata") or metadata.get("token_usage") or metadata.get("usage")
    if isinstance(usage, dict):
        output_tokens = (
            usage.get("output_tokens")
            or usage.get("completion_tokens")
            or usage.get("candidates_token_count")
            or usage.get("output_token_count")
        )

        prompt_details = (
            usage.get("prompt_tokens_details") or usage.get("input_token_details") or {}
        )
        if isinstance(prompt_details, dict):
            cached_input_tokens = prompt_details.get("cached_tokens") or prompt_details.get(
                "cache_read"
            )

        cached_input_tokens = (
            cached_input_tokens
            or usage.get("cached_content_token_count")
            or usage.get("cached_input_tokens")
            or usage.get("cache_read_input_tokens")
        )

    return _safe_int(output_tokens), _safe_int(cached_input_tokens)


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def log_usage(record: LLMUsageRecord) -> None:
    logger.info(
        "LLM usage | agent=%s provider=%s model=%s schema=%s prompt_chars=%s est_input_tokens=%s "
        + "output_tokens=%s cached_input_tokens=%s latency_ms=%.1f cache_layer=%s cache_hit=%s "
        + "fallback=%s parse_success=%s error=%s",
        record.agent_name,
        record.provider,
        record.model,
        record.schema_name,
        record.prompt_chars,
        record.estimated_input_tokens,
        record.output_tokens,
        record.cached_input_tokens,
        record.latency_ms or 0.0,
        record.cache_layer,
        record.cache_hit,
        record.fallback_used,
        record.parse_success,
        record.error,
    )


def record_usage(record: LLMUsageRecord) -> None:
    log_usage(record)
    with _usage_lock:
        bucket = _daily_usage[record.agent_name]
        bucket["calls"] += 1
        bucket["estimated_tokens"] += record.estimated_input_tokens
        bucket["total_latency_ms"] += record.latency_ms or 0.0


def get_usage_summary() -> dict:
    with _usage_lock:
        return {
            "agents": dict(_daily_usage),
            "totals": {
                "calls": sum(v["calls"] for v in _daily_usage.values()),
                "estimated_tokens": sum(v["estimated_tokens"] for v in _daily_usage.values()),
            },
            "free_tier_remaining": max(0, 1500 - sum(
                v["calls"] for v in _daily_usage.values()
            )),
        }


class Timer:
    def __init__(self) -> None:
        self.started = time.perf_counter()

    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self.started) * 1000
