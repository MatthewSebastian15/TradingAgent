from __future__ import annotations

from datetime import datetime, timezone

from tradingagents.dataflows.freshness_policy import get_freshness_status, ttl_for_field


def test_quote_stale_after_five_minutes():
    now = datetime(2026, 6, 5, 12, 10, tzinfo=timezone.utc)
    result = get_freshness_status("quote", "2026-06-05T12:00:00+00:00", now=now)
    assert ttl_for_field("quote") == 300
    assert result["status"] == "stale"


def test_missing_as_of_date_warning():
    result = get_freshness_status("financial_statement", None)
    assert result["status"] == "source_unavailable"
    assert "missing_as_of_date" in result["warnings"]
