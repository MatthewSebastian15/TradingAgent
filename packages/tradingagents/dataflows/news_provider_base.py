from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

import requests

from .errors import ErrorCode
from .news_models import NormalizedNewsArticle

logger = logging.getLogger(__name__)
REDACTED = "***REDACTED***"
HIDDEN_PARAM_KEYS = {"apikey", "api_key", "api_token", "token", "key"}
_SECRET_PATTERNS = [
    re.compile(r"(apikey|api_key|api_token|token|key)=([^&\s]+)", re.IGNORECASE),
]


def sanitize_params(params: dict[str, Any]) -> dict[str, Any]:
    return {key: REDACTED if key.lower() in HIDDEN_PARAM_KEYS else value for key, value in params.items()}


def sanitize_error(value: Any) -> str:
    text = str(value or "")
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(lambda match: f"{match.group(1)}={REDACTED}", text)
    return text[:300]


@dataclass
class ProviderFetchResult:
    provider: str
    status: str
    articles: list[NormalizedNewsArticle] = field(default_factory=list)
    attempts: list[dict[str, Any]] = field(default_factory=list)
    last_error: str | None = None


class BaseNewsProvider:
    provider_name = "base"
    base_url = ""

    def __init__(self, api_key: str, *, timeout_seconds: int = 15, max_retries: int = 2) -> None:
        self.api_key = str(api_key or "").strip()
        self.timeout_seconds = max(1, int(timeout_seconds))
        self.max_retries = max(0, int(max_retries))

    def _request_json(
        self, params: dict[str, Any], *, strategy: str, include_raw: bool
    ) -> tuple[Any | None, dict[str, Any]]:
        safe_params = sanitize_params(params)
        attempt: dict[str, Any] = {"strategy": strategy, "request_params": safe_params}
        delays = [0.5, 1.5]

        for retry in range(self.max_retries + 1):
            started = time.monotonic()
            try:
                response = requests.get(self.base_url, params=params, timeout=(5, self.timeout_seconds))
                attempt["status_code"] = response.status_code
                attempt["duration_ms"] = round((time.monotonic() - started) * 1000)
                if response.status_code in {401, 403}:
                    attempt["status"] = ErrorCode.VENDOR_AUTH_ERROR
                    return None, attempt
                if response.status_code in {402, 429}:
                    attempt["status"] = ErrorCode.VENDOR_QUOTA_ERROR
                    if retry < self.max_retries:
                        time.sleep(delays[min(retry, len(delays) - 1)])
                        continue
                    return None, attempt
                if response.status_code >= 500:
                    attempt["status"] = ErrorCode.VENDOR_EMPTY_RESPONSE
                    if retry < self.max_retries:
                        time.sleep(delays[min(retry, len(delays) - 1)])
                        continue
                    return None, attempt
                response.raise_for_status()
                payload = response.json()
                attempt["status"] = "success"
                if include_raw:
                    attempt["raw_response"] = payload
                return payload, attempt
            except requests.Timeout:
                attempt["duration_ms"] = round((time.monotonic() - started) * 1000)
                attempt["status"] = ErrorCode.VENDOR_TIMEOUT
                if retry < self.max_retries:
                    time.sleep(delays[min(retry, len(delays) - 1)])
                    continue
                return None, attempt
            except Exception as exc:
                attempt["duration_ms"] = round((time.monotonic() - started) * 1000)
                attempt["status"] = ErrorCode.VENDOR_SCHEMA_ERROR
                attempt["error"] = sanitize_error(exc)
                return None, attempt

        return None, attempt
