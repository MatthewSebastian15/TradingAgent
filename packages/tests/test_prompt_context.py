from tradingagents.prompt_context import build_market_context, build_prompt_context, safe_json_dumps


def test_market_prompt_context_is_compact(sample_collected_data):
    context = build_market_context(sample_collected_data)
    rendered = safe_json_dumps(context)

    assert "recent_candles" in context
    assert len(context["recent_candles"]) <= 10
    assert len(rendered) < 9000


def test_collected_data_keeps_raw_data(sample_collected_data):
    assert sample_collected_data.price_data
    assert sample_collected_data.balance_sheet is not None
    assert sample_collected_data.cashflow is not None
    assert sample_collected_data.income_statement is not None


def test_build_prompt_context_has_expected_sections(sample_collected_data):
    context = build_prompt_context(sample_collected_data)

    assert set(context) == {"market", "news_social", "fundamentals"}
    assert context["market"]["last_close"] == 169.0
    assert context["news_social"]["top_related_news"]
    assert context["fundamentals"]["financial_highlights"]["available"] is True
