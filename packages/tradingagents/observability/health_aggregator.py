from __future__ import annotations

from typing import Any

from tradingagents.observability.metrics_collector import get_metrics_collector


def get_observability_summary() -> dict[str, Any]:
    return get_metrics_collector().get_summary()


def get_vendor_stats() -> dict[str, Any]:
    summary = get_observability_summary()
    return {
        "period": summary.get("period", "in_memory_current_process"),
        "vendor_stats": summary.get("vendor_stats", {}),
    }
