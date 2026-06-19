"""News data shaping and scoring helpers."""

from __future__ import annotations

import importlib
import sys
import types
from typing import Any

_LEGACY_MODULES = {
    "news_dedup": "news_dedup_dict",
    "news_deduplication": "news_dedup_normalized",
}


def _load_legacy_module(name: str) -> types.ModuleType:
    alias = f"{__name__}.{name}"
    target = f"{__name__}.{_LEGACY_MODULES[name]}"
    module = importlib.import_module(target)
    sys.modules[alias] = module
    globals()[name] = module
    return module


class _LegacyModule(types.ModuleType):
    def __init__(self, name: str) -> None:
        super().__init__(f"{__name__}.{name}")
        self.__dict__["_legacy_name"] = name

    def __getattr__(self, attr: str) -> Any:
        return getattr(_load_legacy_module(self.__dict__["_legacy_name"]), attr)


def __getattr__(name: str) -> Any:
    if name in _LEGACY_MODULES:
        return _load_legacy_module(name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


for _legacy_name in _LEGACY_MODULES:
    _alias = f"{__name__}.{_legacy_name}"
    if _alias not in sys.modules:
        sys.modules[_alias] = _LegacyModule(_legacy_name)
