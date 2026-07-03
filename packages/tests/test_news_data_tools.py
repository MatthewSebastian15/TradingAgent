import pytest

from tradingagents.agents.utils import news_data_tools as tools_module


@pytest.fixture()
def routed(monkeypatch):
    calls = []

    def fake_route(method, *args):
        calls.append((method, args))
        return f"{method}-report"

    monkeypatch.setattr(tools_module, "route_to_vendor", fake_route)
    return calls


def test_get_news(routed):
    result = tools_module.get_news.invoke(
        {"ticker": "AAPL", "start_date": "2026-06-01", "end_date": "2026-06-30"}
    )
    assert result == "get_news-report"
    assert routed == [("get_news", ("AAPL", "2026-06-01", "2026-06-30"))]


def test_get_global_news_defaults(routed):
    result = tools_module.get_global_news.invoke({"curr_date": "2026-07-03"})
    assert result == "get_global_news-report"
    assert routed == [("get_global_news", ("2026-07-03", 7, 5))]


def test_get_global_news_custom_window(routed):
    tools_module.get_global_news.invoke(
        {"curr_date": "2026-07-03", "look_back_days": 14, "limit": 10}
    )
    assert routed == [("get_global_news", ("2026-07-03", 14, 10))]


def test_get_insider_transactions(routed):
    result = tools_module.get_insider_transactions.invoke({"ticker": "AAPL"})
    assert result == "get_insider_transactions-report"
    assert routed == [("get_insider_transactions", ("AAPL",))]
