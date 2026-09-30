from __future__ import annotations

from tradingagents.pipeline.benchmark_context import build_benchmark_context


def _csv(start: float, step: float, rows: int = 61) -> str:
    lines = ["Date,Open,High,Low,Close,Volume"]
    for index in range(rows):
        price = start + step * index
        date = f"2026-{6 + index // 28:02d}-{index % 28 + 1:02d}"
        lines.append(f"{date},{price},{price},{price},{price},1")
    return "\n".join(lines)


def test_us_ticker_gets_index_and_sector_relative_strength():
    fetched: list[str] = []

    def fetch(symbol: str) -> str:
        fetched.append(symbol)
        return _csv(100.0, 0.0)  # flat benchmark

    context = build_benchmark_context(
        ticker="AAPL", sector="Technology", stock_price_csv=_csv(100.0, 1.0), fetch_price_csv=fetch
    )
    assert fetched == ["^GSPC", "XLK"]
    assert context["benchmark"]["returns_percent"]["5d"] == 0.0
    assert context["benchmark"]["relative_strength_pts"]["5d"] > 0
    assert context["sector"]["sector"] == "Technology"


def test_idx_ticker_gets_ihsg_only_and_fetch_errors_are_contained():
    def fetch(symbol: str) -> str:
        raise RuntimeError("vendor down")

    context = build_benchmark_context(
        ticker="BBCA.JK",
        sector="Financial Services",
        stock_price_csv=_csv(100.0, 1.0),
        fetch_price_csv=fetch,
    )
    assert context["benchmark"]["symbol"] == "^JKSE"
    assert context["benchmark"]["available"] is False
    assert "sector" not in context


def test_unsupported_market_is_explicit():
    context = build_benchmark_context(
        ticker="BTC-USD", sector=None, stock_price_csv="", fetch_price_csv=lambda s: ""
    )
    assert context["available"] is False
