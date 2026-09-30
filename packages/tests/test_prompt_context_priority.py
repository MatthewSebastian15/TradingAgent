from __future__ import annotations

from types import SimpleNamespace

from tradingagents.pipeline_balanced.prompts import _prompt_json
from tradingagents.prompt_context import build_fundamentals_context, build_market_context

CSV = "Date,Open,High,Low,Close,Volume\n" + "\n".join(
    f"2026-08-{day:02d},100,101,99,100,1000" for day in range(1, 29)
)


def test_market_context_keeps_quality_and_price_when_truncated():
    data = SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        time_horizon_months=1,
        price_data=CSV,
        last_close_price=100.0,
        last_close_price_as_of="2026-09-14",
        last_close_price_source="q",
        price_chart={},
        price_performance={},
        technical_entry={},
        technical_indicators="x" * 8000,
        data_quality=SimpleNamespace(model_dump=lambda: {"price_data": "ok"}),
    )
    text, truncated = _prompt_json(build_market_context(data), max_chars=1500)
    assert truncated is True
    assert '"data_quality"' in text
    assert '"last_close"' in text
    assert "technical_indicators" in text.split("omitted_context_keys=")[1]


def test_fundamentals_context_keeps_score_before_raw_rows():
    data = SimpleNamespace(
        ticker="AAPL",
        trade_date="2026-09-14",
        time_horizon_months=1,
        company_profile={},
        financial_highlights={},
        normalized_period_rows=[{"row": "y" * 400}] * 8,
        derived_fundamentals=[],
        event_risk="",
        recommendation_trends="",
        fundamental_analysis={
            "fundamental_score": 68,
            "fundamental_signal": "neutral",
            "blob": "z" * 6000,
        },
        data_quality=SimpleNamespace(model_dump=lambda: {"fundamentals": "ok"}),
    )
    text, _ = _prompt_json(build_fundamentals_context(data), max_chars=2500)
    assert '"fundamental_score":68' in text
    assert '"data_quality"' in text
