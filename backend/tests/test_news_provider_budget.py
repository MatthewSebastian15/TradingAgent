from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

from tradingagents.dataflows.news.news_provider_base import ProviderFetchResult

from services.news.provider_budget import (
    clear_provider_budget_for_tests,
    is_provider_available,
    mark_provider_429,
    mark_provider_failure,
    mark_provider_success,
    provider_cooldown_remaining,
    provider_state_snapshot,
    provider_status,
    result_has_429,
)


def setup_function():
    clear_provider_budget_for_tests()


def teardown_function():
    clear_provider_budget_for_tests()


def test_provider_429_marks_cooldown():
    mark_provider_429("marketaux", cooldown_seconds=60)

    assert is_provider_available("marketaux") is False
    assert provider_status("marketaux") == "cooldown"
    assert provider_cooldown_remaining("marketaux") > 0


def test_provider_success_clears_cooldown():
    mark_provider_429("newsdata", cooldown_seconds=60)
    mark_provider_success("newsdata")

    assert is_provider_available("newsdata") is True
    assert provider_status("newsdata") == "success"


def test_result_has_429_detects_status_code():
    result = ProviderFetchResult(
        provider="google_news_light",
        status="error",
        attempts=[{"status_code": 429, "status": "vendor_quota_error"}],
    )

    assert result_has_429(result) is True


def test_provider_cooldown_expires(monkeypatch):
    current = time.time()
    monkeypatch.setattr(time, "time", lambda: current)
    mark_provider_429("rss_context", cooldown_seconds=10)

    monkeypatch.setattr(time, "time", lambda: current + 11)

    assert is_provider_available("rss_context") is True


def test_repeated_429s_grow_the_cooldown_up_to_the_cap():
    mark_provider_429("marketaux", cooldown_seconds=1000)
    first_remaining = provider_cooldown_remaining("marketaux")

    mark_provider_429("marketaux", cooldown_seconds=1000)
    second_remaining = provider_cooldown_remaining("marketaux")

    mark_provider_429("marketaux", cooldown_seconds=1000)
    third_remaining = provider_cooldown_remaining("marketaux")

    assert first_remaining < second_remaining < third_remaining
    assert third_remaining <= 1000


def test_cooldown_never_exceeds_the_cap_however_many_429s_repeat():
    for _ in range(20):
        mark_provider_429("marketaux", cooldown_seconds=300)

    assert provider_cooldown_remaining("marketaux") <= 300


def test_a_single_429_gets_the_short_base_cooldown_not_the_cap():
    mark_provider_429("newsdata", cooldown_seconds=1800)

    assert 0 < provider_cooldown_remaining("newsdata") <= 130


def test_success_resets_the_consecutive_429_counter():
    mark_provider_429("google_news_light", cooldown_seconds=1800)
    mark_provider_429("google_news_light", cooldown_seconds=1800)
    mark_provider_success("google_news_light")

    mark_provider_429("google_news_light", cooldown_seconds=1800)

    assert provider_cooldown_remaining("google_news_light") <= 130


def test_state_snapshot_exposes_consecutive_429_count():
    mark_provider_429("rss_context", cooldown_seconds=1800)
    mark_provider_429("rss_context", cooldown_seconds=1800)

    assert provider_state_snapshot()["rss_context"]["consecutive_429"] == 2


def test_concurrent_mark_and_read_never_raises_or_corrupts_state():
    provider = "rss_context"

    def hammer(i: int) -> str:
        if i % 3 == 0:
            mark_provider_failure(provider, f"error-{i}")
        elif i % 3 == 1:
            mark_provider_success(provider)
        else:
            mark_provider_429(provider, cooldown_seconds=1)
        return provider_status(provider)

    with ThreadPoolExecutor(max_workers=16) as executor:
        statuses = list(executor.map(hammer, range(300)))

    # No exception/torn state under concurrent writers; every read lands on
    # one of the known status values, never a partially-written object.
    assert set(statuses) <= {"cooldown", "rate_limited", "error", "success"}
