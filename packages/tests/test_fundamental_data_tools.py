import pytest

from tradingagents.agents.utils import fundamental_data_tools as tools_module


@pytest.fixture()
def routed(monkeypatch):
    calls = []

    def fake_route(method, *args):
        calls.append((method, args))
        return {"available": True} if method == "get_company_profile" else f"{method}-report"

    monkeypatch.setattr(tools_module, "route_to_vendor", fake_route)
    return calls


def test_get_fundamentals(routed):
    result = tools_module.get_fundamentals.invoke({"ticker": "AAPL", "curr_date": "2026-07-03"})
    assert result == "get_fundamentals-report"
    assert routed == [("get_fundamentals", ("AAPL", "2026-07-03"))]


def test_get_company_profile_returns_dict(routed):
    result = tools_module.get_company_profile.invoke({"ticker": "AAPL"})
    assert result == {"available": True}
    assert routed == [("get_company_profile", ("AAPL", None))]


@pytest.mark.parametrize(
    ("tool", "method"),
    [
        (tools_module.get_balance_sheet, "get_balance_sheet"),
        (tools_module.get_cashflow, "get_cashflow"),
        (tools_module.get_income_statement, "get_income_statement"),
    ],
)
def test_statement_tools_forward_freq_and_date(routed, tool, method):
    result = tool.invoke({"ticker": "BBCA.JK", "freq": "annual", "curr_date": "2026-07-03"})
    assert result == f"{method}-report"
    assert routed == [(method, ("BBCA.JK", "annual", "2026-07-03"))]


def test_statement_tools_default_quarterly(routed):
    tools_module.get_balance_sheet.invoke({"ticker": "AAPL"})
    assert routed == [("get_balance_sheet", ("AAPL", "quarterly", None))]
