import unittest

import pytest

from cli.utils import normalize_ticker_symbol
from tradingagents.agents.utils.agent_utils import build_instrument_context


@pytest.mark.unit
class TickerSymbolHandlingTests(unittest.TestCase):
    def test_normalize_ticker_symbol_preserves_exchange_suffix(self):
        self.assertEqual(normalize_ticker_symbol(" cnc.to "), "CNC.TO")

    def test_build_instrument_context_mentions_exact_symbol(self):
        context = build_instrument_context("7203.T")
        self.assertIn("7203.T", context)
        self.assertIn("exchange suffix", context)


def test_yfinance_ticker_cache_evicts_oldest_symbol(monkeypatch):
    from tradingagents.dataflows import y_finance

    created = []

    class FakeYF:
        @staticmethod
        def Ticker(symbol):
            created.append(symbol)
            return {"symbol": symbol}

    monkeypatch.setattr(y_finance, "yf", FakeYF)
    monkeypatch.setattr(y_finance, "_TICKER_CACHE_MAX_ENTRIES", 2)
    y_finance._ticker_cache.clear()

    y_finance._get_ticker("AAA")
    y_finance._get_ticker("BBB")
    y_finance._get_ticker("AAA")
    y_finance._get_ticker("CCC")

    assert list(y_finance._ticker_cache.keys()) == ["AAA", "CCC"]
    assert created == ["AAA", "BBB", "CCC"]


if __name__ == "__main__":
    unittest.main()
