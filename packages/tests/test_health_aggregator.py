from tradingagents.observability import health_aggregator


class _StubCollector:
    def __init__(self, summary):
        self._summary = summary

    def get_summary(self):
        return self._summary


def test_vendor_stats_from_collector_summary(monkeypatch):
    summary = {"period": "test_window", "vendor_stats": {"yfinance": {"success": 3}}}
    monkeypatch.setattr(health_aggregator, "get_metrics_collector", lambda: _StubCollector(summary))
    assert health_aggregator.get_vendor_stats() == {
        "period": "test_window",
        "vendor_stats": {"yfinance": {"success": 3}},
    }


def test_vendor_stats_defaults_on_empty_summary(monkeypatch):
    monkeypatch.setattr(health_aggregator, "get_metrics_collector", lambda: _StubCollector({}))
    assert health_aggregator.get_vendor_stats() == {
        "period": "in_memory_current_process",
        "vendor_stats": {},
    }
