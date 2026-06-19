from __future__ import annotations

from tradingagents.graph.run_cache import RunCache


def test_run_cache_set_get_has_and_clear():
    cache = RunCache("job-1")
    key = cache.build_key("quote", "AAPL")

    cache.set(key, {"price": 100})

    assert cache.get(key) == {"price": 100}
    assert cache.has(key) is True
    assert cache.has("missing") is False

    cache.clear()

    assert cache.get(key) is None
    assert cache.has(key) is False


def test_run_cache_key_includes_job_id_and_isolation():
    first = RunCache("job-1")
    second = RunCache("job-2")

    assert first.build_key("history", "AAPL", "1y", "1d") == "run:job-1:history:AAPL:1y:1d"
    assert first.build_key("quote", "AAPL") != second.build_key("quote", "AAPL")


def test_run_cache_hit_does_not_count_vendor_call(monkeypatch):
    from tradingagents.dataflows.providers import interface
    from tradingagents.dataflows.providers.config import use_config
    from tradingagents.dataflows.providers.vendor_budget import VendorBudget

    budget = VendorBudget(max_total_calls=10, per_vendor_limits={"yfinance": 10})
    run_cache = RunCache("job-cache")
    calls = {"count": 0}

    def fake_fundamentals(*args, **kwargs):
        calls["count"] += 1
        return "Revenue and earnings are stable."

    monkeypatch.setattr(interface, "get_budget", lambda _budget_id: budget)
    monkeypatch.setitem(
        interface.VENDOR_METHODS, "get_fundamentals", {"yfinance": fake_fundamentals}
    )
    interface._TOOL_CACHE._data.clear()

    with use_config(
        {
            "data_vendors": {"fundamental_data": "yfinance"},
            "tool_max_retries": 1,
            "tool_timeout_seconds": 5,
            "data_cache_backend": "memory",
            "_vendor_budget_id": "test-budget",
            "_run_cache": run_cache,
        }
    ):
        first = interface.route_to_vendor("get_fundamentals", "AAPL")
        second = interface.route_to_vendor("get_fundamentals", "AAPL")

    summary = budget.get_summary()

    assert first == second
    assert calls["count"] == 1
    assert summary["data_calls"]["used"] == 1
    assert summary["data_calls"]["per_vendor"]["yfinance"]["cache_hits"] == 1
