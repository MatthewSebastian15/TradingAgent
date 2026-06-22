from tradingagents.dataflows.news.news_decision_filter import split_ai_analysis_news
from tradingagents.dataflows.news.news_models import NormalizedNewsArticle
from tradingagents.dataflows.news.news_scoring import score_news_article
from tradingagents.dataflows.news.news_ticker_aliases import resolve_news_ticker


def make_article(**overrides):
    defaults = {
        "provider": "google_news_light",
        "ticker": "BBCA.JK",
        "company_name": "Bank Central Asia",
        "title": "Bank Central Asia reports higher net profit",
        "summary": "BBCA posted stronger earnings.",
        "url": "https://example.com/bbca-profit",
    }
    defaults.update(overrides)
    return NormalizedNewsArticle(**defaults)


def score_and_split(ticker, articles):
    profile = resolve_news_ticker(ticker)
    scored = [score_news_article(article, profile) for article in articles]
    return split_ai_analysis_news(scored, profile, prompt_limit=5)


def test_bbca_company_name_enters_decision_news():
    result = score_and_split("BBCA.JK", [make_article()])

    assert len(result["decision_company_news"]) == 1


def test_tlkm_telkomsel_enters_subsidiary_related():
    article = make_article(
        ticker="TLKM.JK",
        company_name="Telkom Indonesia",
        title="Telkomsel expands 5G network",
        summary="Telkom Indonesia subsidiary continues expansion.",
        url="https://example.com/telkomsel-5g",
    )
    result = score_and_split("TLKM.JK", [article])

    assert result["decision_company_news"][0].relevance_category == "subsidiary_related"


def test_goto_false_positive_go_to_market_is_excluded():
    article = make_article(
        provider="rss_context",
        ticker="GOTO.JK",
        company_name="GoTo Gojek Tokopedia",
        title="How startups go to market faster",
        summary="A guide to go to market strategy.",
        url="https://example.com/go-to-market",
    )
    result = score_and_split("GOTO.JK", [article])

    assert len(result["decision_company_news"]) == 0
    assert result["excluded_news"]


def test_low_score_company_match_falls_back_into_decision_news():
    # Ticker-matched article scoring just below the strict threshold must still surface as
    # decision news, otherwise the decision-maker news section goes blank intermittently.
    article = make_article(relevance_category="company_specific", relevance_score=50)
    profile = resolve_news_ticker("BBCA.JK")
    result = split_ai_analysis_news([article], profile, decision_min_score=70, prompt_limit=5)

    assert len(result["decision_company_news"]) == 1
    assert result["decision_company_news"][0].decision_filter_reason == "fallback_below_threshold"


def test_offticker_near_miss_is_not_promoted_by_fallback():
    # A non-matching article must stay excluded even when the decision feed is empty.
    article = make_article(
        provider="rss_context",
        title="IHSG melemah karena sentimen global",
        summary="Pasar saham tertekan.",
        url="https://example.com/ihsg",
        relevance_category="macro_context",
        relevance_score=90,
    )
    profile = resolve_news_ticker("BBCA.JK")
    result = split_ai_analysis_news([article], profile, decision_min_score=70, prompt_limit=5)

    assert len(result["decision_company_news"]) == 0


def test_rss_ihsg_general_context_not_used_as_company_news():
    article = make_article(
        provider="rss_context",
        title="IHSG melemah karena sentimen The Fed",
        summary="Sektor perbankan ikut tertekan.",
        url="https://example.com/ihsg-fed",
        market_context_only=True,
    )
    result = score_and_split("BBCA.JK", [article])

    assert len(result["decision_company_news"]) == 0
    assert len(result["market_context_news"]) == 1
