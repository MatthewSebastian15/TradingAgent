import threading
import time

import pytest

from tradingagents.dataflows.config import get_config, set_config
from tradingagents.dataflows.news_intelligence import (
    build_analyst_consensus,
    build_catalyst_tracker,
    build_news_impact,
)
from tradingagents.dataflows.stockstats_utils import yf_retry
from tradingagents.pipeline_balanced import (
    AnalystReport,
    LLMBudget,
    _date_window,
    _extract_last_close_price,
    _invoke_once,
)
from tradingagents.pipeline_balanced_data import _build_price_chart, _build_related_news, _parse_markdown_news_items
from tradingagents.technical.entry_quality import build_technical_entry
from tradingagents.utils_resilience import CircuitBreaker, CircuitOpenError, call_with_timeout, get_timeout_stats


def test_llm_budget_records_exhaustion_and_skipped_agents():
    budget = LLMBudget(limit=1)

    assert budget.consume("Market Analyst") is True
    assert budget.consume("News Analyst") is False
    assert budget.consume("Portfolio Manager") is False

    snapshot = budget.snapshot()
    assert snapshot["used"] == 1
    assert snapshot["limit"] == 1
    assert snapshot["budget_exhausted"] is True
    assert snapshot["agents_skipped"] == ["News Analyst", "Portfolio Manager"]


def test_extract_last_close_price_uses_last_row_at_or_before_trade_date():
    price_data = """# Stock data for TEST
# Total records: 3

Date,Open,High,Low,Close,Volume
2026-05-18,10,11,9,10.5,1000
2026-05-19,11,12,10,11.25,1100
2026-05-21,12,13,11,12.5,1200
"""

    assert _extract_last_close_price(price_data, "2026-05-20") == 11.25


def test_build_price_chart_filters_window_and_calculates_stats():
    price_data = """# Stock data for TEST
Date,Open,High,Low,Close,Volume
2026-03-01,8,9,7,8.5,500
2026-05-18,10,11,9,10.5,1000
2026-05-19,11,12,10,11.25,1100
2026-05-31,12,13,11,12.5,1200
"""

    chart = _build_price_chart("TEST", "2026-05-30", price_data, 1, source="yfinance")

    assert chart["available"] is True
    assert chart["lookback_days"] == 365
    assert [point["date"] for point in chart["points"]] == ["2026-03-01", "2026-05-18", "2026-05-19"]
    assert chart["data"] == chart["points"]
    assert chart["points"][0]["adjusted_close"] == 8.5
    assert chart["stats"] == {
        "start_price": 8.5,
        "end_price": 11.25,
        "change": 2.75,
        "change_percent": 32.35,
        "high": 12.0,
        "low": 7.0,
        "average_close": 10.08,
        "average_volume": 867,
        "point_count": 3,
    }
    assert chart["summary"] == {
        "period_return_percent": 32.35,
        "period_high": 12.0,
        "period_low": 7.0,
        "max_drawdown_percent": 0.0,
        "average_volume": 867,
        "latest_volume": 1100,
        "latest_close": 11.25,
        "volume_trend": "above_average",
        "performance_label": "positive",
    }


def test_build_price_chart_filters_incomplete_rows_and_sanitizes_high_low():
    price_data = """# Stock data for TEST
Date,Open,High,Low,Close,Volume
2026-05-18,10,9,12,11,1000
2026-05-19,,12,10,11.25,1100
2026-05-20,11,13,10,12,1200
"""

    chart = _build_price_chart("TEST", "2026-05-30", price_data, 1, source="yfinance")

    assert chart["available"] is True
    assert chart["points"] == [
        {
            "date": "2026-05-18",
            "open": 10.0,
            "high": 12.0,
            "low": 9.0,
            "close": 11.0,
            "adjusted_close": 11.0,
            "volume": 1000,
        },
        {
            "date": "2026-05-20",
            "open": 11.0,
            "high": 13.0,
            "low": 10.0,
            "close": 12.0,
            "adjusted_close": 12.0,
            "volume": 1200,
        },
    ]
    assert chart["stats"]["point_count"] == 2
    assert chart["stats"]["high"] == 13.0
    assert chart["stats"]["low"] == 9.0


@pytest.mark.parametrize(("months", "lookback_days"), [(1, 365), (2, 365), (3, 365)])
def test_build_price_chart_uses_yoy_lookback_and_returns_empty_state(months, lookback_days):
    chart = _build_price_chart("TEST", "2026-05-30", "", months)

    assert chart["available"] is False
    assert chart["lookback_days"] == lookback_days
    assert chart["points"] == []
    assert chart["data"] == []
    assert chart["stats"] == {}
    assert chart["summary"] == {}
    assert chart["warning"] == "Price chart data is unavailable."


def test_build_technical_entry_calculates_indicators_and_support_resistance():
    rows = []
    for index in range(60):
        close = 100 + index
        month = 4 if index < 30 else 5
        day = index + 1 if index < 30 else index - 29
        rows.append(
            {
                "date": f"2026-{month:02d}-{day:02d}",
                "open": close - 0.5,
                "high": close + 2,
                "low": close - 2,
                "close": close,
                "adjusted_close": close,
                "volume": 1_000 + index * 10,
            }
        )

    technical = build_technical_entry(rows, current_price=159)

    assert technical["available"] is True
    assert technical["sma_20"] == 149.5
    assert technical["sma_50"] == 134.5
    assert technical["sma_200"] is None
    assert technical["rsi"] == 100.0
    assert technical["macd_signal"] == "bullish"
    assert technical["support"] == 138.0
    assert technical["resistance"] == 161.0
    assert technical["data_quality"]["status"] == "partial"


def test_build_technical_entry_handles_insufficient_data():
    technical = build_technical_entry([{"date": "2026-05-01", "close": 10, "open": 10, "high": 11, "low": 9}])

    assert technical["available"] is False
    assert technical["entry_quality"] == "N/A"
    assert "ohlcv_history" in technical["data_quality"]["missing_fields"]


def test_news_impact_deduplicates_scores_and_catalyst_classifier():
    related_news = {
        "items": [
            {
                "title": "BBCA earnings beat expectations",
                "url": "https://example.com/news?utm_source=x",
                "source": "MarketAux",
                "published_at": "2026-05-29T10:00:00Z",
                "summary": "Revenue and profit growth were strong.",
                "event_type": "earnings",
                "relevance_score": 90,
            },
            {
                "title": "BBCA earnings beat expectations",
                "url": "https://example.com/news",
                "source": "NewsData",
                "published_at": "2026-05-29T10:00:00Z",
            },
            {
                "title": "BBCA faces regulatory probe",
                "url": "https://example.com/probe",
                "source": "Finnhub",
                "published_at": "2026-05-28",
                "summary": "A regulatory investigation could pressure sentiment.",
                "event_type": "regulatory",
                "relevance_score": 88,
            },
        ]
    }

    impact = build_news_impact("BBCA.JK", "2026-05-30", related_news=related_news)
    tracker = build_catalyst_tracker(
        impact,
        '{"event_risk":{"next_earnings_date":"2026-06-20","risk_level":"medium"},"earnings_calendar":[]}',
    )

    assert impact["available"] is True
    assert impact["news_count"] == 3
    assert impact["deduplicated_count"] == 2
    assert impact["high_impact_news"][0]["impact"] == "high"
    assert tracker["positive_catalysts"]
    assert tracker["negative_catalysts"]
    assert tracker["upcoming_events"][0]["date"] == "2026-06-20"


def test_analyst_consensus_handles_available_and_empty_finnhub_payload():
    payload = """
    {
      "recommendation_trends": [
        {"period":"2026-05","strongBuy":4,"buy":8,"hold":5,"sell":1,"strongSell":0},
        {"period":"2026-04","strongBuy":3,"buy":7,"hold":6,"sell":2,"strongSell":0}
      ]
    }
    """

    consensus = build_analyst_consensus(payload)
    empty = build_analyst_consensus('{"recommendation_trends":[]}')

    assert consensus["available"] is True
    assert consensus["total"] == 18
    assert consensus["consensus_label"] == "positive"
    assert consensus["trend"] == "improving"
    assert empty["available"] is False


def test_parse_markdown_news_items_extracts_vendor_fields_and_skips_missing_url():
    news = """## Source: finnhub
### BBCA reports strong earnings (source: Reuters)
Published: 2026-05-29T10:30:00Z
Event Type: earnings
Short vendor summary.
Link: https://example.com/bbca-earnings?utm_source=test

### BBCA article without source link (source: Example)
This item must be skipped.
"""

    items = _parse_markdown_news_items(news, default_source="company_news", ticker="BBCA.JK")

    assert items == [
        {
            "title": "BBCA reports strong earnings",
            "publisher": "Reuters",
            "published_at": "2026-05-29T10:30:00Z",
            "url": "https://example.com/bbca-earnings?utm_source=test",
            "summary": "Short vendor summary.",
            "source": "finnhub",
            "event_type": "earnings",
            "related_ticker": "BBCA.JK",
            "normalized_url": "https://example.com/bbca-earnings",
            "relevance_reason": (
                "This article is tagged as earnings news and may affect the analysis context for BBCA.JK."
            ),
        }
    ]


def test_build_related_news_deduplicates_limits_and_truncates_vendor_items():
    titles = [
        "BBCA earnings beat expectations",
        "BBCA announces dividend plan",
        "BBCA expands digital banking services",
        "BBCA reports stable loan growth",
        "BBCA opens a new regional office",
        "BBCA updates capital expenditure guidance",
        "BBCA appoints a new finance director",
        "BBCA reviews consumer lending strategy",
        "BBCA launches a merchant payment feature",
        "BBCA schedules its annual shareholder meeting",
    ]
    articles = []
    for index, title in enumerate(titles):
        articles.append(
            {
                "provider": "marketaux",
                "ticker": "BBCA.JK",
                "title": title,
                "url": f"https://example.com/news-{index}",
                "summary": "A" * 500,
                "source": "Example",
                "published_at": f"2026-05-{20 + index:02d}T10:00:00Z",
                "relevance_score": 90 - index,
            }
        )
    articles.append({**articles[0], "url": "https://example.com/news-0?utm_source=duplicate"})
    articles.append(
        {
            "provider": "marketaux",
            "ticker": "BBCA.JK",
            "title": "Invalid URL article",
            "url": "javascript:alert(1)",
        }
    )

    related_news = _build_related_news(
        ticker="BBCA.JK",
        trade_date="2026-05-30",
        time_horizon_months=1,
        company_news="",
        global_news="",
        news_context={"articles": articles},
    )

    assert related_news["available"] is True
    assert related_news["lookback_days"] == 30
    assert len(related_news["items"]) == 8
    assert len({item["normalized_url"] for item in related_news["items"]}) == 8
    assert all(len(item["summary"]) <= 350 for item in related_news["items"])
    assert all(item["url"].startswith("https://") for item in related_news["items"])


def test_build_related_news_returns_empty_state_when_news_is_missing():
    related_news = _build_related_news(
        ticker="AAPL",
        trade_date="2026-05-30",
        time_horizon_months=1,
        company_news="",
        global_news="",
    )

    assert related_news == {
        "available": False,
        "ticker": "AAPL",
        "trade_date": "2026-05-30",
        "lookback_days": 30,
        "source": "unavailable",
        "summary": "No usable related news was returned for this analysis.",
        "items": [],
        "warning": "Related news is unavailable.",
    }


def test_date_window_uses_yoy_price_window_and_horizon_news_window():
    assert _date_window("2026-05-15", 1) == ("2025-05-15", "2026-04-15", "2026-05-16")
    assert _date_window("2026-05-15", 3) == ("2025-05-15", "2026-02-14", "2026-05-16")


def test_call_with_timeout_returns_without_waiting_for_hung_call():
    started_at = time.monotonic()

    with pytest.raises(TimeoutError):
        call_with_timeout(
            lambda: time.sleep(2),
            timeout_seconds=1,
            service_name="test-hung-call",
        )

    assert time.monotonic() - started_at < 1.8
    assert (
        call_with_timeout(
            lambda: "fast",
            timeout_seconds=1,
            service_name="test-after-hung-call",
        )
        == "fast"
    )


def test_call_with_timeout_releases_active_capacity_after_timeout():
    done = threading.Event()

    def slow_call():
        try:
            time.sleep(0.2)
        finally:
            done.set()

    before = get_timeout_stats()

    with pytest.raises(TimeoutError):
        call_with_timeout(
            slow_call,
            timeout_seconds=0.05,
            service_name="test-active-capacity-release",
        )

    after_timeout = get_timeout_stats()
    assert after_timeout["active_calls"] == before["active_calls"]
    assert after_timeout["abandoned_calls"] >= before["abandoned_calls"] + 1

    assert done.wait(1)
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline:
        if get_timeout_stats()["abandoned_calls"] <= before["abandoned_calls"]:
            break
        time.sleep(0.01)

    assert get_timeout_stats()["abandoned_calls"] <= before["abandoned_calls"]


def test_config_scope_propagates_into_timeout_worker():
    set_config({"timeout": 17})

    assert (
        call_with_timeout(
            lambda: get_config()["timeout"],
            timeout_seconds=1,
            service_name="test-config-context",
        )
        == 17
    )


def test_circuit_breaker_allows_only_one_half_open_probe():
    circuit = CircuitBreaker("test-half-open-single-probe", failure_threshold=2, recovery_seconds=1)
    circuit.record_failure(RuntimeError("first failure"))
    circuit.record_failure(RuntimeError("second failure"))
    with circuit._lock:
        circuit._state.opened_at = time.monotonic() - 2

    circuit.before_call()
    with pytest.raises(CircuitOpenError):
        circuit.before_call()

    circuit.record_success()
    circuit.before_call()


def test_circuit_breaker_reopens_after_failed_half_open_probe():
    circuit = CircuitBreaker("test-half-open-failure", failure_threshold=2, recovery_seconds=1)
    circuit.record_failure(RuntimeError("first failure"))
    circuit.record_failure(RuntimeError("second failure"))
    with circuit._lock:
        circuit._state.opened_at = time.monotonic() - 2

    circuit.before_call()
    circuit.record_failure(RuntimeError("probe failed"))

    with pytest.raises(CircuitOpenError):
        circuit.before_call()


def test_yf_retry_retries_timeout_errors():
    attempts = {"count": 0}

    def flaky_call():
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise TimeoutError("temporary network timeout")
        return "ok"

    assert yf_retry(flaky_call, max_retries=1, base_delay=0) == "ok"
    assert attempts["count"] == 2


def test_alpha_vantage_requests_use_native_timeout(monkeypatch):
    from tradingagents.dataflows import alpha_vantage_common

    set_config({"tool_timeout_seconds": 7})
    monkeypatch.setenv("ALPHA_VANTAGE_API_KEY", "alpha-test-key")
    captured = {}

    class Response:
        text = "{}"

        def raise_for_status(self):
            return None

    def fake_get(url, params, timeout):
        captured["url"] = url
        captured["params"] = params
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(alpha_vantage_common.requests, "get", fake_get)

    assert alpha_vantage_common._make_api_request("TIME_SERIES_DAILY", {"symbol": "AAPL"}) == "{}"
    assert captured["timeout"] == (5, 7)
    assert captured["params"]["apikey"] == "alpha-test-key"


def test_yfinance_router_uses_single_app_retry_layer(monkeypatch):
    from tradingagents.dataflows import interface

    attempts = []
    price_csv = "\n".join(
        [
            "Date,Open,High,Low,Close,Volume",
            "2026-05-01,10,11,9,10.5,1000",
        ]
    )

    monkeypatch.setattr(
        interface,
        "get_config",
        lambda: {
            "tool_timeout_seconds": 1,
            "tool_max_retries": 5,
            "cache_ttl_seconds": 1,
            "cache_max_entries": 10,
            "circuit_breaker_failure_threshold": 5,
            "circuit_breaker_recovery_seconds": 60,
        },
    )
    monkeypatch.setattr(interface, "get_vendor", lambda category, method=None: "yfinance")
    monkeypatch.setitem(interface.VENDOR_METHODS["get_stock_data"], "yfinance", lambda *args, **kwargs: price_csv)
    monkeypatch.setattr(interface, "call_with_timeout", lambda func, **kwargs: func())

    def fake_retry(func, **kwargs):
        attempts.append(kwargs["max_attempts"])
        return func()

    monkeypatch.setattr(interface, "call_with_retry", fake_retry)

    assert interface.route_to_vendor("get_stock_data", "AAPL", "2026-05-01", "2026-05-02") == price_csv
    assert attempts == [1]


def test_router_falls_back_when_primary_returns_missing_text(monkeypatch):
    from tradingagents.dataflows import interface

    monkeypatch.setattr(
        interface,
        "get_config",
        lambda: {
            "tool_timeout_seconds": 1,
            "tool_max_retries": 2,
            "cache_ttl_seconds": 1,
            "cache_max_entries": 10,
            "circuit_breaker_failure_threshold": 5,
            "circuit_breaker_recovery_seconds": 60,
        },
    )
    monkeypatch.setattr(interface, "get_vendor", lambda category, method=None: "yfinance,alpha_vantage")
    monkeypatch.setitem(
        interface.VENDOR_METHODS["get_news"], "yfinance", lambda *args, **kwargs: "No news found for TEST"
    )
    monkeypatch.setitem(
        interface.VENDOR_METHODS["get_news"],
        "alpha_vantage",
        lambda *args, **kwargs: "## Alpha Vantage News\n\n### Useful headline",
    )
    monkeypatch.setattr(interface, "call_with_timeout", lambda func, **kwargs: func())
    monkeypatch.setattr(interface, "call_with_retry", lambda func, **kwargs: func())

    result = interface.route_to_vendor("get_news", "TEST_FALLBACK", "2026-05-01", "2026-05-02")

    assert "Useful headline" in result


def test_route_to_all_vendors_returns_every_usable_payload(monkeypatch):
    from tradingagents.dataflows import interface

    monkeypatch.setattr(
        interface,
        "get_config",
        lambda: {
            "tool_timeout_seconds": 1,
            "tool_max_retries": 2,
            "cache_ttl_seconds": 1,
            "cache_max_entries": 10,
            "circuit_breaker_failure_threshold": 5,
            "circuit_breaker_recovery_seconds": 60,
        },
    )
    monkeypatch.setattr(interface, "get_vendor", lambda category, method=None: "yfinance,alpha_vantage")
    monkeypatch.setitem(interface.VENDOR_METHODS["get_news"], "yfinance", lambda *args, **kwargs: "## Yahoo News")
    monkeypatch.setitem(interface.VENDOR_METHODS["get_news"], "alpha_vantage", lambda *args, **kwargs: "## Alpha News")
    monkeypatch.setattr(interface, "call_with_timeout", lambda func, **kwargs: func())
    monkeypatch.setattr(interface, "call_with_retry", lambda func, **kwargs: func())

    result = interface.route_to_all_vendors("get_news", "TEST_ALL", "2026-05-03", "2026-05-04")

    assert result == {"yfinance": "## Yahoo News", "alpha_vantage": "## Alpha News"}


def test_alpha_vantage_stock_normalizes_csv_for_pipeline(monkeypatch):
    from tradingagents.dataflows import alpha_vantage_stock

    raw_csv = "\n".join(
        [
            "timestamp,open,high,low,close,volume",
            "2026-05-14,10,11,9,10.5,1000",
        ]
    )
    monkeypatch.setattr(alpha_vantage_stock, "_make_api_request", lambda function_name, params: raw_csv)

    result = alpha_vantage_stock.get_stock("TEST", "2026-05-14", "2026-05-15")

    assert "Alpha Vantage daily stock data for TEST" in result
    assert "Date,Open,High,Low,Close,Volume" in result
    assert "2026-05-14,10,11,9,10.5,1000" in result


def test_alpha_vantage_news_formats_feed_and_empty_response(monkeypatch):
    from tradingagents.dataflows import alpha_vantage_news

    monkeypatch.setattr(
        alpha_vantage_news,
        "_make_api_request",
        lambda function_name, params: (
            '{"feed":[{"title":"Astra expands","source":"Example","summary":"Expansion summary",'
            '"url":"https://example.com/news","time_published":"20260514T120000"}]}'
        ),
    )

    result = alpha_vantage_news.get_news("ASII.JK", "2026-05-01", "2026-05-15")

    assert "Astra expands" in result
    assert "source: Example" in result
    assert "https://example.com/news" in result

    monkeypatch.setattr(alpha_vantage_news, "_make_api_request", lambda function_name, params: '{"feed":[]}')

    empty = alpha_vantage_news.get_news("ASII.JK", "2026-05-01", "2026-05-15")

    assert empty.startswith("No news found for ASII.JK")


def test_invoke_once_returns_fallback_when_llm_timeout_is_raised():
    class TimeoutLLM:
        def with_structured_output(self, schema):
            return None

        def invoke(self, prompt):
            raise TimeoutError("provider timed out")

    set_config({"timeout": 1})
    fallback = AnalystReport(
        title="Fallback",
        summary="Timed out.",
        key_points=["Timed out."],
        risks=["Timeout"],
        confidence=0.1,
    )

    result = _invoke_once(
        TimeoutLLM(),
        AnalystReport,
        "Prompt",
        fallback,
        "Slow Agent",
    )

    assert result == fallback
