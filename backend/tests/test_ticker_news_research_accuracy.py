from tradingagents.dataflows.news.news_decision_filter import split_ai_analysis_news
from tradingagents.dataflows.news.news_models import NormalizedNewsArticle
from tradingagents.dataflows.news.news_scoring import score_news_article
from tradingagents.dataflows.news.news_ticker_aliases import resolve_news_ticker


def test_provider_status_shape_stays_available_for_missing_keys():
    profile = resolve_news_ticker("BBCA.JK")
    article = score_news_article(
        NormalizedNewsArticle(
            provider="google_news_light",
            ticker="BBCA.JK",
            company_name="Bank Central Asia",
            title="Bank Central Asia reports higher net profit",
            summary="BBCA posted stronger earnings.",
            url="https://example.com/bbca-profit",
        ),
        profile,
    )
    split = split_ai_analysis_news([article], profile, prompt_limit=5)

    assert len(split["decision_company_news"]) == 1
