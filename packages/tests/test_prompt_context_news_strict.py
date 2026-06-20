from tradingagents.dataflows.news.news_context_builder import build_news_context


def test_news_context_strict_mode_does_not_fallback_to_raw_articles():
    result = {
        "strict_news_filter": {"enabled": True},
        "articles": [
            {"title": "IHSG rises", "url": "https://example.com", "market_context_only": True}
        ],
        "decision_company_news": [],
    }
    context = build_news_context("BBCA.JK", "ID", result)["news_context"]

    assert context["top_articles"] == []
    assert context["status"] == "limited"
