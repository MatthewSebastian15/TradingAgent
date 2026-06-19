from __future__ import annotations

from tradingagents.dataflows.quality.data_quality import DataQualityReport
from tradingagents.graph.run_cache import RunCache, ShortLivedTickerCache
from tradingagents.pipeline_balanced_types import CollectedData, LLMBudget


def _collected_data(price_data: str = "price") -> CollectedData:
    return CollectedData(
        ticker="AAPL",
        trade_date="2026-06-01",
        time_horizon_months=1,
        price_data=price_data,
        technical_indicators="technical",
        fundamentals="fundamentals",
        balance_sheet="balance",
        cashflow="cashflow",
        income_statement="income",
        company_news="news",
        global_news="global",
        insider_transactions="insider",
        data_quality=DataQualityReport(price_data="ok", fundamentals="ok", news="ok"),
        last_close_price=100.0,
    )


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


def test_short_lived_ticker_cache_hit_miss_and_key_isolation():
    cache = ShortLivedTickerCache(ttl_seconds=300)
    first = _collected_data("first")
    second = _collected_data("second")

    cache.set("aapl", "2026-06-01", first)
    cache.set("AAPL", "2026-06-02", second)

    assert cache.get("AAPL", "2026-06-01").price_data == "first"
    assert cache.get("AAPL", "2026-06-02").price_data == "second"
    assert cache.get("MSFT", "2026-06-01") is None


def test_short_lived_ticker_cache_returns_deepcopy():
    cache = ShortLivedTickerCache(ttl_seconds=300)
    data = _collected_data()
    data.news_context = {"items": [{"title": "original"}]}

    cache.set("AAPL", "2026-06-01", data)
    cached = cache.get("AAPL", "2026-06-01")
    cached.news_context["items"][0]["title"] = "mutated"

    assert cache.get("AAPL", "2026-06-01").news_context["items"][0]["title"] == "original"


def test_short_lived_ticker_cache_expires(monkeypatch):
    cache = ShortLivedTickerCache(ttl_seconds=1)
    now = {"value": 100.0}
    monkeypatch.setattr("tradingagents.graph.run_cache.time.monotonic", lambda: now["value"])

    cache.set("AAPL", "2026-06-01", _collected_data())
    now["value"] = 101.1

    assert cache.get("AAPL", "2026-06-01") is None


def test_collect_market_data_uses_cached_data_without_collection(monkeypatch):
    from tradingagents import pipeline_balanced_orchestrator as orchestrator
    from tradingagents.pipeline_balanced_orchestrator import PipelineContext

    cached = _collected_data()

    def should_not_collect(*_args, **_kwargs):
        raise AssertionError("collection tasks should be skipped")

    monkeypatch.setattr(orchestrator, "_collect_raw_market_data", should_not_collect)
    context = PipelineContext(
        ticker="AAPL",
        trade_date="2026-06-01",
        config={},
        quick_llm=None,
        deep_llm=None,
        analysis_depth="balanced",
        depth_config={},
        depth_debate_rounds=1,
        depth_risk_rounds=1,
        extra_debate_rounds=0,
        extra_risk_rounds=0,
        time_horizon_months=1,
        time_horizon_text="1 month",
        llm_budget=LLMBudget(1),
        pipeline_started_at=0.0,
        pipeline_timings={},
        progress_callback=None,
        cancel_check=None,
        has_existing_position=False,
        position_quantity=None,
        average_entry_price=None,
    )

    stage = orchestrator.collect_market_data(context, cached_data=cached)

    assert stage.data == cached
    assert context.pipeline_timings["data_collection"]["status"] == "ok"


def test_collect_market_data_miss_uses_collection(monkeypatch):
    from tradingagents import pipeline_balanced_orchestrator as orchestrator
    from tradingagents.pipeline_balanced_orchestrator import PipelineContext

    collected = _collected_data("fresh")
    calls = {"count": 0}

    def collect(*_args, **_kwargs):
        calls["count"] += 1
        return collected

    monkeypatch.setattr(orchestrator, "_collect_raw_market_data", collect)
    context = PipelineContext(
        ticker="AAPL",
        trade_date="2026-06-01",
        config={},
        quick_llm=None,
        deep_llm=None,
        analysis_depth="balanced",
        depth_config={},
        depth_debate_rounds=1,
        depth_risk_rounds=1,
        extra_debate_rounds=0,
        extra_risk_rounds=0,
        time_horizon_months=1,
        time_horizon_text="1 month",
        llm_budget=LLMBudget(1),
        pipeline_started_at=0.0,
        pipeline_timings={},
        progress_callback=None,
        cancel_check=None,
        has_existing_position=False,
        position_quantity=None,
        average_entry_price=None,
    )

    stage = orchestrator.collect_market_data(context)

    assert stage.data.price_data == "fresh"
    assert calls["count"] == 1
