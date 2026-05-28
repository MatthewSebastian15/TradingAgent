from __future__ import annotations

import threading
import uuid
from typing import Any


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
        self.method_calls: dict[str, dict[str, int]] = {}
        self.blocked_calls: list[dict[str, str]] = []
        self._lock = threading.Lock()

    def can_call(self, vendor: str) -> bool:
        vendor = str(vendor)
        with self._lock:
            if self.max_total_calls and self.total_calls >= self.max_total_calls:
                return False
            vendor_limit = self.per_vendor_limits.get(vendor)
            if vendor_limit is not None and vendor_limit and self.vendor_calls.get(vendor, 0) >= vendor_limit:
                return False
            return True

    def record_call(self, vendor: str, method: str) -> None:
        vendor = str(vendor)
        method = str(method)
        with self._lock:
            self.total_calls += 1
            self.vendor_calls[vendor] = self.vendor_calls.get(vendor, 0) + 1
            method_counts = self.method_calls.setdefault(method, {})
            method_counts[vendor] = method_counts.get(vendor, 0) + 1

    def record_blocked(self, vendor: str, method: str, reason: str) -> None:
        with self._lock:
            self.blocked_calls.append({"vendor": str(vendor), "method": str(method), "reason": str(reason)[:300]})

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            used_finnhub = self.vendor_calls.get("finnhub", 0)
            max_finnhub = self.per_vendor_limits.get("finnhub", 0)
            return {
                "max_total_calls": self.max_total_calls,
                "max_finnhub_calls": max_finnhub,
                "used_total_calls": self.total_calls,
                "used_finnhub_calls": used_finnhub,
                "vendor_calls": dict(self.vendor_calls),
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
    budget = VendorBudget(
        max_total_calls=int(config.get("data_vendor_max_calls_per_analysis", 12) or 12),
        per_vendor_limits={"finnhub": int(finnhub_config.get("max_calls_per_analysis", 8) or 8)},
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
