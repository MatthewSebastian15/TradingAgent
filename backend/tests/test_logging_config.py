"""Smoke tests for logging_config.py."""

from __future__ import annotations

import logging

from logging_config import RequestIdFilter, configure_logging, new_request_id, request_id_ctx


def _filter_count(handler: logging.Handler) -> int:
    return sum(isinstance(f, RequestIdFilter) for f in handler.filters)


def test_new_request_id_is_short_hex():
    request_id = new_request_id()
    assert len(request_id) == 12
    int(request_id, 16)  # raises if not hex


def test_request_id_filter_injects_context():
    record = logging.LogRecord("test", logging.INFO, __file__, 1, "msg", None, None)
    token = request_id_ctx.set("abc123def456")
    try:
        assert RequestIdFilter().filter(record) is True
        assert record.request_id == "abc123def456"
    finally:
        request_id_ctx.reset(token)


def test_configure_logging_is_idempotent():
    root = logging.getLogger()
    original_level = root.level
    try:
        configure_logging(logging.WARNING)
        assert root.level == logging.WARNING
        assert root.handlers  # basicConfig attached at least one handler

        configure_logging(logging.WARNING)  # re-init must not duplicate filters
        for handler in root.handlers:
            assert _filter_count(handler) == 1
    finally:
        root.setLevel(original_level)


def test_log_format_renders_request_id_not_secrets():
    # Production format string + RequestIdFilter: request_id renders, unknown attrs don't.
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [request_id=%(request_id)s] %(name)s: %(message)s"
    )
    record = logging.LogRecord("test", logging.INFO, __file__, 1, "vendor call ok", None, None)
    token = request_id_ctx.set("req-xyz")
    try:
        RequestIdFilter().filter(record)
    finally:
        request_id_ctx.reset(token)
    record.api_key = "super-secret-value"
    rendered = formatter.format(record)
    assert "request_id=req-xyz" in rendered
    assert "super-secret-value" not in rendered
