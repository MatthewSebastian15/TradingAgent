from __future__ import annotations

from datetime import datetime, timezone

from tradingagents.dataflows.quality.freshness_policy import get_freshness_status, ttl_for_field


def test_missing_as_of_date_returns_unknown_stale():
    result = get_freshness_status("quote", None)
    assert result["status"] == "unknown"
    assert result["is_stale"] is True
    assert "missing_as_of_date" in result["warnings"]


def test_quote_stale_after_five_minutes():
    now = datetime(2026, 6, 5, 12, 10, tzinfo=timezone.utc)
    result = get_freshness_status("quote", "2026-06-05T12:00:00+00:00", now=now)
    assert ttl_for_field("quote") == 300
    assert result["status"] == "stale"


def test_financial_statement_not_stale_inside_ttl():
    now = datetime(2026, 6, 5, tzinfo=timezone.utc)
    as_of = datetime(2026, 6, 1, tzinfo=timezone.utc)
    result = get_freshness_status("financial_statement", as_of, now=now)
    assert result["status"] == "fresh"
