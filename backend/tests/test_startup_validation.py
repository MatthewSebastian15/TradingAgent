from __future__ import annotations

import logging

from config_validation import validate_startup_config


def test_warn_when_finnhub_key_exists_but_disabled(monkeypatch, caplog):
    monkeypatch.setenv("FINNHUB_API_KEY", "dummy-secret")
    monkeypatch.setenv("FINNHUB_ENABLED", "false")
    with caplog.at_level(logging.WARNING):
        validate_startup_config()
    assert "FINNHUB_API_KEY is set but FINNHUB_ENABLED=false" in caplog.text
    assert "dummy-secret" not in caplog.text
