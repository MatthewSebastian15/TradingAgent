from __future__ import annotations

from tradingagents.dataflows.news_relevance import build_news_relevance_terms, is_relevant_news


def test_build_news_relevance_terms_for_bbca():
    terms = build_news_relevance_terms("BBCA.JK", "PT Bank Central Asia Tbk", ["BCA"])

    assert "BBCA.JK" in terms
    assert "BBCA" in terms
    assert "PT Bank Central Asia Tbk" in terms
    assert "Bank Central Asia" in terms
    assert "BCA" in terms


def test_ticker_match_is_relevant():
    article = {
        "title": "BBCA posts higher quarterly profit",
        "summary": "Shares rose after earnings.",
    }

    assert is_relevant_news(article, "BBCA.JK", "PT Bank Central Asia Tbk") is True


def test_company_alias_match_is_relevant():
    article = {
        "title": "BCA expands digital banking services",
        "summary": "New service targets retail customers.",
    }

    assert is_relevant_news(article, "BBCA.JK", "PT Bank Central Asia Tbk", ["BCA"]) is True


def test_entity_match_is_relevant():
    article = {
        "title": "Bank earnings update",
        "entities": [{"symbol": "BBCA.JK", "name": "PT Bank Central Asia Tbk"}],
    }

    assert is_relevant_news(article, "BBCA.JK", "PT Bank Central Asia Tbk") is True


def test_unrelated_fedex_article_is_rejected_for_bbca():
    article = {
        "title": "FedEx cuts delivery outlook",
        "summary": "Logistics demand weakens in the US.",
    }

    assert is_relevant_news(article, "BBCA.JK", "PT Bank Central Asia Tbk", ["BCA"]) is False


def test_macro_inflation_article_without_company_is_rejected_for_bbca():
    article = {
        "title": "US inflation data pressures Asian markets",
        "summary": "The Fed may keep rates high.",
    }

    assert is_relevant_news(article, "BBCA.JK", "PT Bank Central Asia Tbk", ["BCA"]) is False


def test_gold_article_without_company_is_rejected_for_bbca():
    article = {
        "title": "Gold prices rise as dollar weakens",
        "summary": "Commodity investors rotate assets.",
    }

    assert is_relevant_news(article, "BBCA.JK", "PT Bank Central Asia Tbk", ["BCA"]) is False
