import pytest

from tradingagents.agents.utils import sentiment_data_tools as tools_module


@pytest.fixture()
def routed(monkeypatch):
    calls = []

    def fake_route(method, *args):
        calls.append((method, args))
        return f"{method}-report"

    monkeypatch.setattr(tools_module, "route_to_vendor", fake_route)
    return calls


def test_get_news_sentiment(routed):
    result = tools_module.get_news_sentiment.invoke({"ticker": "AAPL"})
    assert result == "get_news_sentiment-report"
    assert routed == [("get_news_sentiment", ("AAPL",))]


def test_get_social_sentiment(routed):
    result = tools_module.get_social_sentiment.invoke(
        {"ticker": "AAPL", "start_date": "2026-06-01", "end_date": "2026-06-30"}
    )
    assert result == "get_social_sentiment-report"
    assert routed == [("get_social_sentiment", ("AAPL", "2026-06-01", "2026-06-30"))]


def test_docstrings_warn_against_relabeling():
    # contract: unavailable sentiment must not be treated as neutral/social sentiment
    assert "unavailable" in tools_module.get_news_sentiment.description
    assert "unavailable" in tools_module.get_social_sentiment.description
