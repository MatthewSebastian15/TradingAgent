from __future__ import annotations

import re
import threading
import uuid
from collections import defaultdict
from dataclasses import asdict, dataclass
from typing import Any

_SECRET_PATTERNS = [
    re.compile(r"token=([^&\s]+)", re.IGNORECASE),
    re.compile(r"apikey=([^&\s]+)", re.IGNORECASE),
    re.compile(r"api_key=([^&\s]+)", re.IGNORECASE),
]


@dataclass
class VendorAttempt:
    vendor: str
    status: str
    reason: str | None = None
    duration_ms: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def sanitize_error(value: Any) -> str:
    text = str(value or "")
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(lambda m: m.group(0).split("=")[0] + "=[REDACTED]", text)
    return text[:500]


class VendorAttemptRecorder:
    """Tracks vendor outcomes per route for final metadata."""

    def __init__(self) -> None:
        self._attempts: dict[str, list[str]] = defaultdict(list)
        self._lock = threading.Lock()

    def record(self, method: str, vendor: str, status: str, detail: str | None = None) -> None:
        method_key = method_to_metadata_key(method)
        entry = f"{vendor}:{status}"
        if detail:
            entry = f"{entry}({sanitize_error(detail)})"
        with self._lock:
            self._attempts[method_key].append(entry)

    def get_summary(self) -> dict[str, list[str]]:
        with self._lock:
            return {key: list(value) for key, value in self._attempts.items()}


_RECORDERS: dict[str, VendorAttemptRecorder] = {}
_RECORDERS_LOCK = threading.Lock()


def create_attempt_recorder() -> tuple[str, VendorAttemptRecorder]:
    recorder_id = uuid.uuid4().hex
    recorder = VendorAttemptRecorder()
    with _RECORDERS_LOCK:
        _RECORDERS[recorder_id] = recorder
    return recorder_id, recorder


def get_attempt_recorder(recorder_id: str | None) -> VendorAttemptRecorder | None:
    if not recorder_id:
        return None
    with _RECORDERS_LOCK:
        return _RECORDERS.get(str(recorder_id))


def release_attempt_recorder(recorder_id: str | None) -> None:
    if not recorder_id:
        return
    with _RECORDERS_LOCK:
        _RECORDERS.pop(str(recorder_id), None)


def method_to_metadata_key(method: str) -> str:
    mapping = {
        "get_quote": "quote",
        "get_stock_data": "ohlcv",
        "get_indicators": "technical",
        "get_fundamentals": "fundamentals",
        "get_balance_sheet": "financial_statements",
        "get_cashflow": "financial_statements",
        "get_income_statement": "financial_statements",
        "get_news": "news",
        "get_global_news": "news",
        "get_news_sentiment": "news_sentiment",
        "get_social_sentiment": "social_sentiment",
        "get_earnings_calendar": "event_risk",
        "get_recommendation_trends": "event_risk",
        "get_insider_transactions": "insider",
        "get_insider_sentiment": "insider",
    }
    return mapping.get(method, method)
