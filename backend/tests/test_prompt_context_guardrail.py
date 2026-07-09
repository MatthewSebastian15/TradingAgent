from __future__ import annotations

from dataclasses import asdict

from tradingagents.dataflows.news.news_context_builder import build_news_context
from tradingagents.graph.prompt_context_builder import PromptContext, build_prompt_context
from tradingagents.llm.llm_router import apply_guardrail


def _state(**overrides):
    state = {
        "symbol": "AAPL",
        "market": "US",
        "field_sources": {"quote": "yfinance", "news": "marketaux"},
        "data_quality": {
            "overall": "partial",
            "source_confidence_score": 72,
            "blocking_fields_missing": [],
            "warnings": ["Cashflow contains fallback fields"],
        },
        "field_quality": {
            "cashflow": {"status": "partial", "source": "yfinance", "warnings": ["fallback"]}
        },
        "limitations": ["Financial data contains fallback fields"],
        "sector": "technology",
        "normalized_financials": [{"period": "FY2025", "revenue": 100}],
        "news_context": {
            "top_articles": [
                {"title": "Apple earnings rise", "provider": "marketaux", "relevance_score": 90}
            ],
            "limitations": ["News coverage is partial"],
        },
        "vendor_budget": {"llm_calls": {"used": 1, "max": 3}, "data_calls": {"used": 2, "max": 10}},
        "warnings": [],
    }
    state.update(overrides)
    return state


def test_build_prompt_context_returns_compact_dataclass():
    context = build_prompt_context(_state())

    assert isinstance(context, PromptContext)
    assert context.symbol == "AAPL"
    assert context.market == "US"
    assert context.field_sources["quote"] == "yfinance"
    assert context.data_quality["field_quality"]["cashflow"]["status"] == "partial"
    assert context.limitations == [
        "Financial data contains fallback fields",
        "News coverage is partial",
    ]
    assert context.normalized_financials == [{"period": "FY2025", "revenue": 100}]
    assert context.top_news[0]["title"] == "Apple earnings rise"
    assert context.budget_remaining == {"llm_calls_left": 2, "data_calls_left": 8}
    assert "raw_payload" not in str(asdict(context))


def test_apply_guardrail_blocks_buy_and_sell_when_quote_missing():
    context = build_prompt_context(
        _state(data_quality={"quote_missing": True, "source_confidence_score": 100})
    )

    assert apply_guardrail(context, "BUY")[0] == "WAIT"
    assert apply_guardrail(context, "SELL")[0] == "WAIT"


def test_apply_guardrail_blocks_action_when_source_confidence_low():
    context = build_prompt_context(_state(data_quality={"source_confidence_score": 49}))

    assert apply_guardrail(context, "BUY")[0] == "WAIT"
    assert apply_guardrail(context, "SELL")[0] == "WAIT"


def test_apply_guardrail_warns_on_blocking_missing_data():
    context = build_prompt_context(_state(data_quality={"blocking_fields_missing": ["quote"]}))

    action, warnings = apply_guardrail(context, "BUY")

    assert action == "WAIT"
    assert "Action downgraded to WAIT: blocking data unavailable" in warnings


def test_apply_guardrail_does_not_turn_wait_into_action():
    context = build_prompt_context(_state(data_quality={"quote_missing": True}))

    assert apply_guardrail(context, "WAIT")[0] == "WAIT"


def test_build_news_context_filters_unrelated_articles():
    result = build_news_context(
        "AAPL",
        "US",
        {
            "company_name": "Apple Inc",
            "provider_status": {"marketaux": "success"},
            # strict mode only reads decision_company_news/prompt_articles;
            # disable it so the raw-article relevance filter is what gets tested
            "strict_news_filter": {"enabled": False},
            "articles": [
                {
                    "title": "Apple reports stronger earnings",
                    "provider": "marketaux",
                    "summary": "Apple Inc revenue improved.",
                    "published_at": "2026-06-01T00:00:00+00:00",
                    "relevance_score": 90,
                },
                {
                    "title": "Tesla expands charging network",
                    "provider": "marketaux",
                    "summary": "Tesla adds chargers.",
                    "published_at": "2026-06-01T00:00:00+00:00",
                    "relevance_score": 95,
                },
            ],
        },
        max_articles=8,
    )

    articles = result["news_context"]["top_articles"]

    assert len(articles) == 1
    assert articles[0]["title"] == "Apple reports stronger earnings"
