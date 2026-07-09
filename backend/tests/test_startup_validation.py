from __future__ import annotations

import asyncio
import logging

import pytest

import main
from config_validation import validate_startup_config


def test_warn_when_finnhub_key_exists_but_disabled(monkeypatch, caplog):
    monkeypatch.setenv("FINNHUB_API_KEY", "dummy-secret")
    monkeypatch.setenv("FINNHUB_ENABLED", "false")
    with caplog.at_level(logging.WARNING):
        validate_startup_config()
    assert "FINNHUB_API_KEY is set but FINNHUB_ENABLED=false" in caplog.text
    assert "dummy-secret" not in caplog.text


def test_validate_config_raises_on_critical_in_production(monkeypatch):
    monkeypatch.setattr(main, "IS_PRODUCTION", True)
    monkeypatch.setattr(main, "validate_startup_config", lambda: ["CRITICAL: API_KEY missing"])
    with pytest.raises(RuntimeError, match="refusing to start"):
        asyncio.run(main.validate_config())


def test_validate_config_continues_on_critical_in_development(monkeypatch, caplog):
    monkeypatch.setattr(main, "IS_PRODUCTION", False)
    monkeypatch.setattr(main, "validate_startup_config", lambda: ["CRITICAL: API_KEY missing"])
    with caplog.at_level(logging.WARNING):
        asyncio.run(main.validate_config())
    assert "Server continues for debugging" in caplog.text
