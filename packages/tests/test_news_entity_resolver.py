from tradingagents.dataflows.news.news_entity_resolver import resolve_news_entities
from tradingagents.dataflows.news.news_ticker_aliases import resolve_news_ticker


def test_resolve_news_ticker_expanded_idx_aliases():
    profile = resolve_news_ticker("BBCA.JK")

    assert "BCA" in profile["aliases"]
    assert "Bank Central Asia" in profile["aliases"]
    assert "PT Bank Central Asia Tbk" in profile["aliases"]
    assert "" not in profile["aliases"]


def test_resolve_news_ticker_goto_has_subsidiaries_and_negative_terms():
    profile = resolve_news_ticker("GOTO.JK")

    assert {"Gojek", "Tokopedia", "GoPay"}.issubset(set(profile["subsidiaries"]))
    assert "go to market" in profile["negative_terms"]


def test_resolve_news_entities_excludes_goto_false_positive():
    result = resolve_news_entities(
        {"title": "How startups go to market faster", "summary": "A go to market guide."},
        "GOTO.JK",
    )

    assert result["entity_match"] == "negative"


def test_resolve_news_entities_marks_telkomsel_as_subsidiary():
    result = resolve_news_entities(
        {"title": "Telkomsel expands 5G network", "summary": "Network expansion continues."},
        "TLKM.JK",
    )

    assert result["entity_match"] == "subsidiary"
    assert "Telkomsel" in result["matched_terms"]
