from tradingagents.agents.utils import technical_indicators_tools as tools_module
from tradingagents.agents.utils.technical_indicators_tools import get_indicators


def test_single_indicator_routed(monkeypatch):
    calls = []

    def fake_route(method, *args):
        calls.append((method, args))
        return f"{args[1]}-values"

    monkeypatch.setattr(tools_module, "route_to_vendor", fake_route)
    result = get_indicators.invoke(
        {"symbol": "AAPL", "indicator": "rsi", "curr_date": "2026-07-03"}
    )
    assert result == "rsi-values"
    assert calls == [("get_indicators", ("AAPL", "rsi", "2026-07-03", 365))]


def test_comma_separated_indicators_split_and_joined(monkeypatch):
    monkeypatch.setattr(
        tools_module, "route_to_vendor", lambda method, symbol, ind, *rest: f"{ind}-values"
    )
    result = get_indicators.invoke(
        {"symbol": "AAPL", "indicator": "RSI, macd ,", "curr_date": "2026-07-03"}
    )
    assert result == "rsi-values\n\nmacd-values"  # lower-cased, blanks dropped


def test_value_error_reported_inline(monkeypatch):
    def fake_route(method, symbol, ind, *rest):
        if ind == "bogus":
            raise ValueError("Indicator bogus is not supported.")
        return f"{ind}-values"

    monkeypatch.setattr(tools_module, "route_to_vendor", fake_route)
    result = get_indicators.invoke(
        {"symbol": "AAPL", "indicator": "rsi,bogus", "curr_date": "2026-07-03"}
    )
    assert "rsi-values" in result
    assert "Indicator bogus is not supported." in result


def test_tool_contract():
    assert get_indicators.name == "get_indicators"
    assert "technical indicator" in get_indicators.description
