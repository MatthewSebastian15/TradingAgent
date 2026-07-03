import pytest

from tradingagents.agents.utils import event_data_tools as tools_module


@pytest.fixture()
def routed(monkeypatch):
    calls = []

    def fake_route(method, *args):
        calls.append((method, args))
        return f"{method}-report"

    monkeypatch.setattr(tools_module, "route_to_vendor", fake_route)
    return calls


def test_get_earnings_calendar(routed):
    result = tools_module.get_earnings_calendar.invoke(
        {"ticker": "AAPL", "start_date": "2026-06-01", "end_date": "2026-09-30"}
    )
    assert result == "get_earnings_calendar-report"
    assert routed == [("get_earnings_calendar", ("AAPL", "2026-06-01", "2026-09-30"))]


def test_get_recommendation_trends(routed):
    result = tools_module.get_recommendation_trends.invoke({"ticker": "AAPL"})
    assert result == "get_recommendation_trends-report"
    assert routed == [("get_recommendation_trends", ("AAPL",))]
