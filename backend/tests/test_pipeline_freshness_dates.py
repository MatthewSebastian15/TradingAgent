from __future__ import annotations

from tradingagents.pipeline_balanced_data import (
    latest_financial_as_of,
    latest_news_published_at,
    latest_price_as_of,
)


def test_financial_quality_uses_period_as_of_not_trade_date():
    normalized_rows = [
        {"period": {"period_label": "FY2024", "as_of_date": "2025-03-31"}},
    ]
    assert latest_financial_as_of(normalized_rows) == "2025-03-31"


def test_news_quality_uses_latest_published_at():
    articles = [
        {"published_at": "2026-06-05T08:00:00Z"},
        {"published_at": "2026-06-05T09:00:00Z"},
    ]
    assert latest_news_published_at(articles) == "2026-06-05T09:00:00Z"


def test_price_quality_uses_latest_price_row_date():
    rows = [
        {"date": "2026-06-03", "close": 100},
        {"date": "2026-06-04", "close": 101},
    ]
    assert latest_price_as_of(rows) == "2026-06-04"
