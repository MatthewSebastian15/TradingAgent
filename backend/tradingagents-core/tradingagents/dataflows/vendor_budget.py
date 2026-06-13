from __future__ import annotations

import threading
import uuid
from typing import Any

from .errors import ErrorCode

DEFAULT_VENDOR_BUDGET = {
    "max_total_data_calls": 25,
    "per_vendor": {
        "yfinance": 8,
        "alpha_vantage": 3,
        "google_news_light": 4,
        "marketaux": 4,
        "newsdata": 4,
        "finnhub": 5,
    },
}


class VendorBudget:
    """Thread-safe request budget for one analysis run.

    The budget counts vendor calls before they are made. That is intentional:
    a failed HTTP request still consumes provider quota in the real world, because
    apparently even disappointment needs accounting.
    """

    def __init__(self, max_total_calls: int, per_vendor_limits: dict[str, int] | None = None):
        self.max_total_calls = max(0, int(max_total_calls or 0))
        self.per_vendor_limits = {str(k): max(0, int(v)) for k, v in (per_vendor_limits or {}).items()}
        self.total_calls = 0
        self.vendor_calls: dict[str, int] = {vendor: 0 for vendor in self.per_vendor_limits}
        self.cache_hits: dict[str, int] = {vendor: 0 for vendor in self.per_vendor_limits}
        self.method_calls: dict[str, dict[str, int]] = {}
        self.blocked_calls: list[dict[str, str]] = []
        self._lock = threading.Lock()

    def can_call(self, vendor: str) -> bool:
        vendor = str(vendor)
        with self._lock:
            if self.max_total_calls and self.total_calls >= self.max_total_calls:
                return False
            vendor_limit = self.per_vendor_limits.get(vendor)
            return not (vendor_limit is not None and vendor_limit and self.vendor_calls.get(vendor, 0) >= vendor_limit)

    def record_call(self, vendor: str, method: str) -> None:
        vendor = str(vendor)
        method = str(method)
        with self._lock:
            self.total_calls += 1
            self.vendor_calls[vendor] = self.vendor_calls.get(vendor, 0) + 1
            method_counts = self.method_calls.setdefault(method, {})
            method_counts[vendor] = method_counts.get(vendor, 0) + 1

    def record_cache_hit(self, vendor: str, method: str) -> None:
        del method
        vendor = str(vendor)
        with self._lock:
            self.cache_hits[vendor] = self.cache_hits.get(vendor, 0) + 1

    def record_blocked(self, vendor: str, method: str, reason: str) -> None:
        with self._lock:
            self.blocked_calls.append(
                {
                    "vendor": str(vendor),
                    "method": str(method),
                    "reason": str(reason)[:300],
                    "code": ErrorCode.VENDOR_BUDGET_EXCEEDED,
                }
            )

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            used_finnhub = self.vendor_calls.get("finnhub", 0)
            max_finnhub = self.per_vendor_limits.get("finnhub", 0)
            per_vendor = {
                vendor: {
                    "used": self.vendor_calls.get(vendor, 0),
                    "limit": limit,
                    "cache_hits": self.cache_hits.get(vendor, 0),
                }
                for vendor, limit in self.per_vendor_limits.items()
            }
            return {
                "data_calls": {
                    "used": self.total_calls,
                    "max": self.max_total_calls,
                    "per_vendor": per_vendor,
                    "blocked_calls": list(self.blocked_calls),
                },
                "max_total_calls": self.max_total_calls,
                "max_finnhub_calls": max_finnhub,
                "used_total_calls": self.total_calls,
                "used_finnhub_calls": used_finnhub,
                "vendor_calls": dict(self.vendor_calls),
                "cache_hits": dict(self.cache_hits),
                "method_calls": {method: dict(counts) for method, counts in self.method_calls.items()},
                "blocked_calls": list(self.blocked_calls),
                "budget_exceeded": bool(
                    (self.max_total_calls and self.total_calls >= self.max_total_calls)
                    or (max_finnhub and used_finnhub >= max_finnhub)
                    or self.blocked_calls
                ),
            }


_BUDGETS: dict[str, VendorBudget] = {}
_BUDGETS_LOCK = threading.Lock()


def create_budget_from_config(config: dict[str, Any]) -> tuple[str, VendorBudget]:
    finnhub_config = config.get("finnhub", {}) if isinstance(config.get("finnhub"), dict) else {}
    configured_limits = dict(DEFAULT_VENDOR_BUDGET["per_vendor"])
    configured_limits["finnhub"] = int(
        finnhub_config.get("max_calls_per_analysis") or configured_limits["finnhub"]
    )
    configured_limits.update(
        {
            str(k): int(v)
            for k, v in dict(config.get("data_vendor_per_vendor_budget") or {}).items()
            if str(k).strip()
        }
    )
    budget = VendorBudget(
        max_total_calls=int(
            config.get("data_vendor_max_calls_per_analysis")
            or DEFAULT_VENDOR_BUDGET["max_total_data_calls"]
        ),
        per_vendor_limits=configured_limits,
    )
    budget_id = uuid.uuid4().hex
    with _BUDGETS_LOCK:
        _BUDGETS[budget_id] = budget
    return budget_id, budget


def get_budget(budget_id: str | None) -> VendorBudget | None:
    if not budget_id:
        return None
    with _BUDGETS_LOCK:
        return _BUDGETS.get(str(budget_id))


def release_budget(budget_id: str | None) -> None:
    if not budget_id:
        return
    with _BUDGETS_LOCK:
        _BUDGETS.pop(str(budget_id), None)
