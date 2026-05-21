from __future__ import annotations

import copy
import threading
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Dict, Iterator, Optional

import tradingagents.default_config as default_config

_DEFAULT_CONFIG: Dict = copy.deepcopy(default_config.DEFAULT_CONFIG)
_config: Dict = copy.deepcopy(_DEFAULT_CONFIG)
_config_lock = threading.RLock()
_thread_config = threading.local()
_context_config: ContextVar[Optional[Dict]] = ContextVar("tradingagents_config", default=None)


def _snapshot(config: Dict | None = None) -> Dict:
    """Return an isolated config snapshot merged over defaults."""
    merged = copy.deepcopy(_DEFAULT_CONFIG)
    if config:
        merged.update(copy.deepcopy(config))
    return merged


def initialize_config():
    """Initialize the process fallback configuration with default values."""
    global _config
    with _config_lock:
        _config = copy.deepcopy(_DEFAULT_CONFIG)


def set_config(config: Dict):
    """Set the active configuration for the current execution context.

    The old implementation mutated one module-level dictionary. In a web API,
    concurrent analyses could overwrite each other's provider, depth, timeout,
    and retry values. This function now installs an isolated snapshot in both a
    ContextVar and thread-local storage. A process fallback is retained for
    legacy call paths that do not propagate context into their own worker
    threads, but normal API paths should read the scoped value.
    """
    global _config
    scoped = _snapshot(config)
    _context_config.set(scoped)
    _thread_config.value = scoped
    with _config_lock:
        _config = copy.deepcopy(scoped)


@contextmanager
def use_config(config: Dict) -> Iterator[Dict]:
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


def get_config() -> Dict:
    """Get the active configuration for this execution context."""
    scoped = _context_config.get()
    if scoped is not None:
        return copy.deepcopy(scoped)

    thread_scoped = getattr(_thread_config, "value", None)
    if thread_scoped is not None:
        return copy.deepcopy(thread_scoped)

    with _config_lock:
        return copy.deepcopy(_config)


initialize_config()
