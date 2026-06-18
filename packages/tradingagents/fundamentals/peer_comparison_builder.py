from __future__ import annotations

from typing import Any


def build_peer_comparison(payload: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("metrics"), list)
        or not payload["metrics"]
    ):
        return None
    quality = dict(payload.get("data_quality") or {})
    quality.setdefault("status", "complete")
    quality.setdefault("missing_fields", [])
    quality.setdefault("fallback_used", [])
    quality.setdefault("warnings", [])
    return {
        "primary_ticker": payload.get("primary_ticker"),
        "peers": list(payload.get("peers") or []),
        "metrics": [item for item in payload["metrics"] if isinstance(item, dict)],
        "ranking_summary": dict(payload.get("ranking_summary") or {}),
        "data_quality": quality,
    }
