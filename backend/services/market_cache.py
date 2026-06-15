from __future__ import annotations

from copy import deepcopy
from time import monotonic
from typing import Any


class MarketTTLCache:
    def __init__(self) -> None:
        self._items: dict[str, tuple[float, float, Any]] = {}

    def get(self, key: str) -> Any | None:
        item = self._items.get(key)
        if item is None:
            return None

        saved_at, ttl_seconds, value = item
        if monotonic() - saved_at > ttl_seconds:
            self._items.pop(key, None)
            return None

        return deepcopy(value)

    def set(self, key: str, value: Any, ttl_seconds: float) -> Any:
        self._items[key] = (monotonic(), ttl_seconds, deepcopy(value))
        return value

    def clear(self) -> None:
        self._items.clear()


market_cache = MarketTTLCache()
