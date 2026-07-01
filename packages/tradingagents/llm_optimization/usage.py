from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


def _new_bucket() -> dict:
    return {
        "calls": 0,
        "estimated_tokens": 0,
        "total_latency_ms": 0.0,
        "cache_hits": 0,
        "fallbacks": 0,
        "parse_ok": 0,
    }


_usage_lock = threading.Lock()
_daily_usage: dict[str, dict] = defaultdict(_new_bucket)

# Process-wide telemetry accumulated in the FastAPI parent process (fed per
# completed analysis via ingest_analysis_telemetry). Separate from _daily_usage,
# which lives in each pipeline worker and is reset per analysis.
# ponytail: in-memory, resets on restart; persist to sqlite if cross-restart
# weekly history is ever needed.
_telemetry_lock = threading.Lock()
_telemetry_agents: dict[str, dict] = defaultdict(_new_bucket)
_telemetry_news_blanks: list[dict] = []
_TELEMETRY_BLANK_CAP = 200


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
        if record.cache_hit:
            bucket["cache_hits"] += 1
        if record.fallback_used:
            bucket["fallbacks"] += 1
        if record.parse_success:
            bucket["parse_ok"] += 1


def reset_usage() -> None:
    """Clear per-analysis usage. Called at the start of each pipeline run."""
    with _usage_lock:
        _daily_usage.clear()


def get_usage_summary() -> dict:
    with _usage_lock:
        return {
            "agents": {name: dict(bucket) for name, bucket in _daily_usage.items()},
            "totals": {
                "calls": sum(v["calls"] for v in _daily_usage.values()),
                "estimated_tokens": sum(v["estimated_tokens"] for v in _daily_usage.values()),
            },
            "free_tier_remaining": max(0, 1500 - sum(v["calls"] for v in _daily_usage.values())),
        }


def _agent_row(bucket: dict) -> dict:
    calls = bucket.get("calls", 0) or 0
    return {
        **bucket,
        "avg_latency_ms": round((bucket.get("total_latency_ms", 0.0) / calls), 1) if calls else 0.0,
        "fallback_rate": round(bucket.get("fallbacks", 0) / calls, 3) if calls else 0.0,
        "cache_hit_rate": round(bucket.get("cache_hits", 0) / calls, 3) if calls else 0.0,
    }


def _news_blank_reason(news: Any) -> str | None:
    """Best-effort: did this analysis blank the company-news feed?"""
    if not isinstance(news, dict):
        return None
    if news.get("empty_reason"):
        return str(news["empty_reason"])[:200]
    strict = news.get("strict_news_filter")
    count = strict.get("decision_company_news_count") if isinstance(strict, dict) else None
    if count is None:
        count = news.get("articles_used_in_prompt")
    if count == 0:
        return "no_company_news"
    return None


def ingest_analysis_telemetry(
    summary: dict | None, *, ticker: str | None = None, news: Any = None
) -> None:
    """Merge one completed analysis's per-agent usage into process-wide telemetry."""
    agents = (summary or {}).get("agents") or {}
    with _telemetry_lock:
        for name, bucket in agents.items():
            if not isinstance(bucket, dict):
                continue
            target = _telemetry_agents[name]
            for key in ("calls", "estimated_tokens", "cache_hits", "fallbacks", "parse_ok"):
                target[key] += int(bucket.get(key) or 0)
            target["total_latency_ms"] += float(bucket.get("total_latency_ms") or 0.0)
        blank = _news_blank_reason(news)
        if blank and ticker:
            _telemetry_news_blanks.append({"ticker": ticker, "reason": blank})
            del _telemetry_news_blanks[:-_TELEMETRY_BLANK_CAP]


def get_telemetry_summary() -> dict:
    """Aggregated per-agent telemetry for the /api/debug/llm-usage endpoint."""
    with _telemetry_lock:
        agents = {name: _agent_row(bucket) for name, bucket in _telemetry_agents.items()}
        return {
            "agents": agents,
            "totals": {
                "calls": sum(v["calls"] for v in agents.values()),
                "fallbacks": sum(v["fallbacks"] for v in agents.values()),
                "cache_hits": sum(v["cache_hits"] for v in agents.values()),
            },
            "news_blank_feeds": list(_telemetry_news_blanks[-50:]),
            "news_blank_count": len(_telemetry_news_blanks),
        }


def reset_telemetry() -> None:
    """Test helper: clear process-wide telemetry."""
    with _telemetry_lock:
        _telemetry_agents.clear()
        _telemetry_news_blanks.clear()


class Timer:
    def __init__(self) -> None:
        self.started = time.perf_counter()

    def elapsed_ms(self) -> float:
        return (time.perf_counter() - self.started) * 1000
