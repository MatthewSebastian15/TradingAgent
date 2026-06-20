from tradingagents.dataflows.news.news_query_builder import build_ticker_news_queries
from tradingagents.dataflows.news.news_ticker_aliases import resolve_news_ticker


def test_bbca_queries_contain_company_and_aliases():
    queries = build_ticker_news_queries(resolve_news_ticker("BBCA.JK"), max_queries=20)
    joined = " ".join(queries)

    assert "Bank Central Asia" in joined
    assert "BCA" in joined
    assert all(query.strip() for query in queries)


def test_goto_queries_contain_subsidiaries():
    queries = build_ticker_news_queries(resolve_news_ticker("GOTO.JK"), max_queries=40)
    joined = " ".join(queries)

    assert "GoTo" in joined
    assert "Gojek" in joined
    assert "Tokopedia" in joined
    assert "GoPay" in joined


def test_aapl_queries_contain_apple_terms_and_limit():
    queries = build_ticker_news_queries(resolve_news_ticker("AAPL"), max_queries=12)
    joined = " ".join(queries)

    assert "Apple" in joined
    assert "Apple Inc" in joined
    assert len(queries) <= 12
