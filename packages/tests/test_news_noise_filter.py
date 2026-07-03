from tradingagents.dataflows.news.news_noise_filter import route_news_bucket


def test_company_specific_always_full_news():
    assert route_news_bucket({"relevance_category": "company_specific"}) == "full_news"
    assert route_news_bucket({"relevance_category": "subsidiary_related"}) == "full_news"


def test_sector_related_needs_score():
    sector = {"relevance_category": "sector_related"}
    assert route_news_bucket({**sector, "relevance_score": 55}) == "full_news"
    assert route_news_bucket({**sector, "relevance_score": 54}) == "discard"


def test_macro_related_needs_score():
    macro = {"relevance_category": "macro_related"}
    assert route_news_bucket({**macro, "relevance_score": 65}) == "macro_context"
    assert route_news_bucket({**macro, "relevance_score": 60}) == "discard"


def test_noise_hidden_and_unknown_discarded():
    assert route_news_bucket({"relevance_category": "market_noise"}) == "hidden_debug"
    assert route_news_bucket({}) == "discard"
    assert route_news_bucket({"relevance_score": None}) == "discard"


def test_category_fallback_key():
    assert route_news_bucket({"category": "company_specific"}) == "full_news"
