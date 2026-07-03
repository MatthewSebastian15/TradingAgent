from tradingagents.agents.utils import core_stock_tools as tools_module


def test_get_stock_data_routes_to_vendor(monkeypatch):
    calls = []

    def fake_route(method, *args):
        calls.append((method, args))
        return "Date,Close\n2026-07-02,100.0"

    monkeypatch.setattr(tools_module, "route_to_vendor", fake_route)
    result = tools_module.get_stock_data.invoke(
        {"symbol": "BBCA.JK", "start_date": "2026-06-01", "end_date": "2026-07-02"}
    )
    assert result == "Date,Close\n2026-07-02,100.0"
    assert calls == [("get_stock_data", ("BBCA.JK", "2026-06-01", "2026-07-02"))]


def test_tool_contract():
    assert tools_module.get_stock_data.name == "get_stock_data"
    assert "OHLCV" in tools_module.get_stock_data.description
