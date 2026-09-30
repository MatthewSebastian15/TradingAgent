from __future__ import annotations

import json
from types import SimpleNamespace

from tradingagents.dataflows.news.vendor_signal_summary import (
    summarize_insider_transactions,
    summarize_vendor_sentiment,
)
from tradingagents.prompt_context import build_news_context

INSIDER = json.dumps(
    {
        "symbol": "AAPL",
        "insider_transactions": [
            {"transactionCode": "P", "change": 1000, "transactionDate": "2026-09-01"},
            {"transactionCode": "S", "change": -400, "transactionDate": "2026-08-20"},
            {"transactionCode": "M", "change": 5000, "transactionDate": "2026-08-25"},
            {"transactionCode": "S", "change": -9000, "transactionDate": "2026-01-02"},
        ],
    }
)


def test_insider_summary_counts_open_market_trades_in_window():
    summary = summarize_insider_transactions(INSIDER, as_of="2026-09-14")
    assert summary == {
        "available": True,
        "source": "finnhub",
        "lookback_days": 90,
        "open_market_buys": 1,
        "open_market_sells": 1,
        "net_shares_changed": 600.0,
        "latest_transaction_date": "2026-09-01",
    }


def test_insider_summary_refuses_unstructured_text():
    summary = summarize_insider_transactions(
        "# Insider Transactions data\nDate,Shares", as_of="2026-09-14"
    )
    assert summary["available"] is False


def test_vendor_sentiment_keeps_only_available_payloads():
    news = json.dumps({"available": True, "news_sentiment": {"bullish_percent": 0.61}})
    social = json.dumps({"available": False})
    summary = summarize_vendor_sentiment(news, social)
    assert summary["news_sentiment"] == {"bullish_percent": 0.61}
    assert summary["social_summary"] is None


def test_news_context_exposes_new_keys():
    data = SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        time_horizon_months=1,
        related_news={},
        news_context={},
        news_impact={},
        catalyst_tracker={},
        analyst_consensus={},
        insider_transactions=INSIDER,
        news_sentiment="",
        social_sentiment="",
        data_quality=SimpleNamespace(model_dump=lambda: {}),
    )
    context = build_news_context(data)
    assert context["insider_activity"]["open_market_buys"] == 1
    assert "vendor_sentiment" in context


def test_fit_json_payload_keeps_valid_json_and_newest_rows():
    from tradingagents.dataflows.news.vendor_signal_summary import fit_json_payload

    rows = [
        {"transactionCode": "S", "change": -1, "transactionDate": f"2026-{m:02d}-{d:02d}"}
        for m in range(1, 9)
        for d in range(1, 29)
    ]
    raw = json.dumps({"symbol": "AAPL", "insider_transactions": rows})
    fitted = fit_json_payload(raw, 3_000)

    payload = json.loads(fitted)
    assert len(fitted) <= 3_000
    assert payload["insider_transactions"][0]["transactionDate"] == "2026-08-28"
    assert fit_json_payload("not json " * 1000, 100) == "not json " * 1000
    assert fit_json_payload("{}", 100) == "{}"


def test_news_context_puts_compact_signals_before_top_articles():
    data = SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        time_horizon_months=1,
        related_news={},
        news_context={"top_articles": [{"title": "x" * 500}] * 8},
        news_impact={},
        catalyst_tracker={},
        analyst_consensus={},
        insider_transactions=INSIDER,
        news_sentiment="",
        social_sentiment="",
        data_quality=SimpleNamespace(model_dump=lambda: {}),
    )
    keys = list(build_news_context(data))
    assert keys.index("insider_activity") < keys.index("top_articles")
    assert keys.index("vendor_sentiment") < keys.index("top_articles")
    assert keys.index("analyst_consensus") < keys.index("top_articles")
