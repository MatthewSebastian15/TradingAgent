from __future__ import annotations

import threading
from collections import defaultdict
from typing import Any

_BLOCKED_KEY_PARTS = (
    "api_key",
    "apikey",
    "secret",
    "token",
    "authorization",
    "raw_response",
    "response_body",
)


class MetricsCollector:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def record_vendor_call(
        self,
        vendor: str,
        status: str,
        latency_ms: int | None,
        data_type: str,
    ) -> None:
        vendor_key = _safe_key(vendor)
        status_key = _normalize_status(status)
        data_type_key = _safe_key(data_type)
        with self._lock:
            stats = self._vendor_stats[vendor_key]
            stats["calls"] += 1
            stats["statuses"][status_key] += 1
            if latency_ms is not None:
                stats["latency_total_ms"] += max(0, int(latency_ms))
                stats["latency_count"] += 1
            if data_type_key in {
                "fundamental",
                "fundamentals",
                "financials",
                "financial_statements",
            }:
                self._fundamental_coverage["calls"] += 1
                if status_key in {"success", "partial", "cache_hit"}:
                    self._fundamental_coverage["hit_count"] += 1

    def record_cache_event(
        self,
        cache_type: str,
        hit: bool,
    ) -> None:
        cache_key = _safe_key(cache_type)
        with self._lock:
            stats = self._cache_stats[cache_key]
            stats["hit_count" if hit else "miss_count"] += 1

    def record_llm_call(
        self,
        model_type: str,
        success: bool,
        latency_ms: int | None,
    ) -> None:
        model_key = _model_type(model_type)
        with self._lock:
            stats = self._llm_stats[model_key]
            stats["calls"] += 1
            if success:
                stats["success"] += 1
            if latency_ms is not None:
                stats["latency_total_ms"] += max(0, int(latency_ms))
                stats["latency_count"] += 1

    def record_fallback(
        self,
        from_vendor: str,
        to_vendor: str,
        data_type: str,
    ) -> None:
        fallback_key = f"{_safe_key(from_vendor)}_to_{_safe_key(to_vendor)}"
        with self._lock:
            self._fallback_stats[fallback_key] += 1
            self._fallback_by_data_type[_safe_key(data_type)] += 1

    def record_partial_result(self, reason: str) -> None:
        reason_key = _safe_key(reason)
        with self._lock:
            self._partial_results[reason_key] += 1

    def record_warning(self, warning_type: str) -> None:
        warning_key = _safe_key(warning_type)
        with self._lock:
            self._warnings[warning_key] += 1
            self._analysis_count += 1

    def get_summary(self) -> dict:
        with self._lock:
            return {
                "period": "in_memory_current_process",
                "vendor_stats": _vendor_summary(self._vendor_stats),
                "cache_stats": _cache_summary(self._cache_stats),
                "llm_stats": _llm_summary(self._llm_stats),
                "analysis_stats": {
                    "partial_result_count": sum(self._partial_results.values()),
                    "avg_warning_count": _ratio(
                        sum(self._warnings.values()), max(1, self._analysis_count)
                    ),
                    "warning_count": sum(self._warnings.values()),
                    "warnings_by_type": dict(self._warnings),
                    "partial_results_by_reason": dict(self._partial_results),
                },
                "fallback_stats": dict(self._fallback_stats),
                "fallback_by_data_type": dict(self._fallback_by_data_type),
                "fundamental_coverage": {
                    "calls": self._fundamental_coverage["calls"],
                    "hit_count": self._fundamental_coverage["hit_count"],
                    "hit_ratio": _ratio(
                        self._fundamental_coverage["hit_count"],
                        self._fundamental_coverage["calls"],
                    ),
                },
            }

    def reset(self) -> None:
        with getattr(self, "_lock", threading.Lock()):
            self._vendor_stats: dict[str, dict[str, Any]] = defaultdict(
                lambda: {
                    "calls": 0,
                    "statuses": defaultdict(int),
                    "latency_total_ms": 0,
                    "latency_count": 0,
                }
            )
            self._cache_stats: dict[str, dict[str, int]] = defaultdict(
                lambda: {"hit_count": 0, "miss_count": 0}
            )
            self._llm_stats: dict[str, dict[str, int]] = defaultdict(
                lambda: {"calls": 0, "success": 0, "latency_total_ms": 0, "latency_count": 0}
            )
            self._fallback_stats: dict[str, int] = defaultdict(int)
            self._fallback_by_data_type: dict[str, int] = defaultdict(int)
            self._partial_results: dict[str, int] = defaultdict(int)
            self._warnings: dict[str, int] = defaultdict(int)
            self._analysis_count = 0
            self._fundamental_coverage = {"calls": 0, "hit_count": 0}


_COLLECTOR = MetricsCollector()


def get_metrics_collector() -> MetricsCollector:
    return _COLLECTOR


def _safe_key(value: Any) -> str:
    text = str(value or "unknown").strip().lower().replace("-", "_").replace(" ", "_")
    if any(part in text for part in _BLOCKED_KEY_PARTS):
        return "redacted"
    return "".join(char for char in text if char.isalnum() or char == "_")[:80] or "unknown"


def _normalize_status(status: Any) -> str:
    value = _safe_key(status)
    aliases = {"ok": "success", "failure": "fail", "failed": "fail", "unavailable": "empty"}
    return aliases.get(value, value)


def _model_type(model_type: Any) -> str:
    value = _safe_key(model_type)
    if "deep" in value:
        return "deep"
    if "quick" in value or "fast" in value:
        return "quick"
    return value


def _ratio(numerator: int | float, denominator: int | float) -> float:
    if not denominator:
        return 0.0
    return round(float(numerator) / float(denominator), 4)


def _vendor_summary(stats: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for vendor, payload in stats.items():
        calls = int(payload["calls"])
        statuses = payload["statuses"]
        latency_count = int(payload["latency_count"])
        summary[vendor] = {
            "calls": calls,
            "success_rate": _ratio(
                statuses.get("success", 0) + statuses.get("cache_hit", 0), calls
            ),
            "avg_latency_ms": round(payload["latency_total_ms"] / latency_count)
            if latency_count
            else 0,
            "empty_rate": _ratio(statuses.get("empty", 0), calls),
            "success_count": statuses.get("success", 0) + statuses.get("cache_hit", 0),
            "empty_count": statuses.get("empty", 0),
            "fail_count": statuses.get("fail", 0),
            "quota_blocked": statuses.get("rate_limited", 0) + statuses.get("budget_exceeded", 0),
            "status_counts": dict(statuses),
        }
    return summary


def _cache_summary(stats: dict[str, dict[str, int]]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for cache_type, payload in stats.items():
        hits = int(payload["hit_count"])
        misses = int(payload["miss_count"])
        summary[cache_type] = {
            "hit_ratio": _ratio(hits, hits + misses),
            "miss_count": misses,
            "hit_count": hits,
        }
    return summary


def _llm_summary(stats: dict[str, dict[str, int]]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {
        "quick": {"calls": 0, "success_rate": 0.0, "avg_latency_ms": 0},
        "deep": {"calls": 0, "success_rate": 0.0, "avg_latency_ms": 0},
        "budget_exceeded_count": 0,
    }
    for model_type, payload in stats.items():
        if model_type == "budget_exceeded":
            summary["budget_exceeded_count"] = int(payload["calls"])
            continue
        calls = int(payload["calls"])
        latency_count = int(payload["latency_count"])
        summary[model_type] = {
            "calls": calls,
            "success_rate": _ratio(payload["success"], calls),
            "avg_latency_ms": round(payload["latency_total_ms"] / latency_count)
            if latency_count
            else 0,
        }
    return summary
