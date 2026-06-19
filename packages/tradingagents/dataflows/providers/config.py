from __future__ import annotations

import copy
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

import tradingagents.default_config as default_config

_DEFAULT_CONFIG: dict = copy.deepcopy(default_config.DEFAULT_CONFIG)
_thread_config = threading.local()
_context_config: ContextVar[dict | None] = ContextVar("tradingagents_config", default=None)


def _snapshot(config: dict | None = None) -> dict:
    """Return an isolated config snapshot merged over defaults."""
    merged = copy.deepcopy(_DEFAULT_CONFIG)
    if config:
        merged.update(copy.deepcopy(config))
    return merged


def initialize_config():
    """Clear config overrides for the current execution context/thread."""
    _context_config.set(None)
    if hasattr(_thread_config, "value"):
        delattr(_thread_config, "value")


def set_config(config: dict):
    """Set the active configuration for the current execution context.

    The old implementation mutated one module-level dictionary. In a web API,
    concurrent analyses could overwrite each other's provider, depth, timeout,
    and retry values. This function now installs an isolated snapshot in both a
    ContextVar and thread-local storage only. There is deliberately no
    process-global mutable fallback; unscoped reads return defaults instead of
    another job's most recent config.
    """
    scoped = _snapshot(config)
    _context_config.set(scoped)
    _thread_config.value = scoped


@contextmanager
def use_config(config: dict) -> Iterator[dict]:
    """Temporarily install *config* for the current context/thread."""
    scoped = _snapshot(config)
    token = _context_config.set(scoped)
    had_thread_config = hasattr(_thread_config, "value")
    previous_thread_config = getattr(_thread_config, "value", None)
    _thread_config.value = scoped
    try:
        yield copy.deepcopy(scoped)
    finally:
        _context_config.reset(token)
        if had_thread_config:
            _thread_config.value = previous_thread_config
        elif hasattr(_thread_config, "value"):
            delattr(_thread_config, "value")


def get_config() -> dict:
    """Get the active configuration for this execution context."""
    scoped = _context_config.get()
    if scoped is not None:
        return copy.deepcopy(scoped)

    thread_scoped = getattr(_thread_config, "value", None)
    if thread_scoped is not None:
        return copy.deepcopy(thread_scoped)

    return copy.deepcopy(_DEFAULT_CONFIG)


initialize_config()
