from __future__ import annotations

from tradingagents.dataflows.news_decision_filter import split_ai_analysis_news
from tradingagents.dataflows.news_models import NormalizedNewsArticle


def test_rss_market_context_does_not_enter_decision_news():
    article = NormalizedNewsArticle(
        provider="rss_context",
        ticker="BBCA.JK",
        title="Asian markets rise before Fed decision",
        url="https://example.com/rss",
        source="CNBC",
        relevance_score=45,
        relevance_category="market_context",
        market_context_only=True,
        bucket="macro_context",
    )

    split = split_ai_analysis_news(
        [article],
        {"ticker": "BBCA.JK", "company_name": "Bank Central Asia", "aliases": ["BCA"]},
    )

    assert len(split["decision_company_news"]) == 0
    assert len(split["market_context_news"]) == 1


def test_rss_strong_company_match_can_enter_decision_news():
    article = NormalizedNewsArticle(
        provider="rss_context",
        ticker="BBCA.JK",
        company_name="Bank Central Asia",
        title="Bank Central Asia shares move after earnings update",
        summary="BBCA reports resilient earnings growth.",
        url="https://example.com/bbca",
        source="CNBC",
        relevance_score=85,
        relevance_category="company_match",
        market_context_only=False,
        bucket="full_news",
    )

    split = split_ai_analysis_news(
        [article],
        {"ticker": "BBCA.JK", "company_name": "Bank Central Asia", "aliases": ["BCA", "BBCA"]},
    )

    assert len(split["decision_company_news"]) == 1


def test_company_news_without_company_match_is_excluded():
    article = NormalizedNewsArticle(
        provider="marketaux",
        ticker="BBCA.JK",
        company_name="Bank Central Asia",
        title="US inflation pressures Asian markets",
        url="https://example.com/macro",
        source="Reuters",
        relevance_score=90,
        relevance_category="company_specific",
        market_context_only=False,
        bucket="full_news",
    )

    split = split_ai_analysis_news(
        [article],
        {"ticker": "BBCA.JK", "company_name": "Bank Central Asia", "aliases": ["BCA"]},
    )

    assert len(split["decision_company_news"]) == 0
    assert split["excluded_news"][0]["reason"] == "no_company_match"
