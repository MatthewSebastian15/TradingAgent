from __future__ import annotations

import importlib


def test_result_cache_ttl_defaults_to_double_click_window(monkeypatch):
    monkeypatch.delenv("ANALYSIS_RESULT_CACHE_TTL_SECONDS", raising=False)
    from config import defaults

    reloaded = importlib.reload(defaults)

    assert reloaded.ANALYSIS_RESULT_CACHE_TTL_SECONDS == 60
