from __future__ import annotations

from unittest.mock import patch

import pytest


def test_check_scope_valid_news():
    from services.rag_service import check_scope

    assert check_scope("Apa berita terbaru tentang Tesla?") is True


def test_check_scope_valid_market():
    from services.rag_service import check_scope

    assert check_scope("Market hari ini sedang bagaimana?") is True


def test_check_scope_valid_analysis():
    from services.rag_service import check_scope

    assert check_scope("Kenapa META diberi HOLD dalam analisis?") is True


def test_check_scope_invalid_recipe():
    from services.rag_service import check_scope

    assert check_scope("Buatkan resep nasi goreng.") is False


def test_check_scope_invalid_coding():
    from services.rag_service import check_scope

    assert check_scope("Bagaimana cara membuat website React?") is False


def test_check_scope_unrecognized_is_out_of_scope():
    # No in-scope and no out-of-scope keyword: must default to out-of-scope.
    from services.rag_service import check_scope

    assert check_scope("What is 2 + 2?") is False
    assert check_scope("") is False


def test_detect_intent_news():
    from services.rag_service import detect_intent

    result = detect_intent("Ringkas berita terbaru hari ini.", "all")
    assert "news" in result


def test_detect_intent_market():
    from services.rag_service import detect_intent

    result = detect_intent("Ticker apa yang paling naik hari ini?", "all")
    assert "market" in result


def test_detect_intent_analysis():
    from services.rag_service import detect_intent

    result = detect_intent("Ringkas hasil analisis META.", "all")
    assert "analysis" in result


def test_detect_intent_respects_filter():
    from services.rag_service import detect_intent

    result = detect_intent("ceritakan apapun", "news")
    assert result == ["news"]


def test_detect_intent_mixed():
    from services.rag_service import detect_intent

    result = detect_intent("Apakah news terbaru mendukung hasil analisis NVDA?", "all")
    assert "news" in result
    assert "analysis" in result


def test_check_scope_valid_quant_portfolio_economic():
    from services.rag_service import check_scope

    assert check_scope("What is the Sharpe ratio and max drawdown for NVDA?") is True
    assert check_scope("Berapa profit/loss portofolio saya?") is True
    assert check_scope("What is the latest fed funds rate and yield curve?") is True


def test_detect_intent_quant_routes_to_analysis():
    from services.rag_service import detect_intent

    result = detect_intent("Show me the beta, volatility and risk-reward.", "all")
    assert "analysis" in result


def test_detect_intent_portfolio_and_economic():
    from services.rag_service import detect_intent

    assert detect_intent("Bagaimana untung-rugi holding saya?", "all") == ["portfolio"]
    assert detect_intent("Apa dampak inflasi dan suku bunga fed?", "all") == ["economic"]
    assert detect_intent("anything", "portfolio") == ["portfolio"]
    assert detect_intent("anything", "economic") == ["economic"]


@pytest.mark.asyncio
async def test_build_context_portfolio():
    from services.rag_service import build_context

    portfolio_ctx = {
        "holdings": [{"ticker": "AAPL", "shares": 10, "cost_basis": 100}],
        "quotes": [{"sym": "AAPL", "price": 150}],
        "fetched_at": "2026-06-29T00:00:00Z",
    }
    context, sources = await build_context(
        "portfolio pnl", ["portfolio"], portfolio_context=portfolio_ctx
    )
    assert "[PORTFOLIO] AAPL" in context
    assert "pnl=500 " in context  # (150-100)*10
    assert any(s["type"] == "portfolio" for s in sources)


@pytest.mark.asyncio
async def test_build_context_economic():
    from services.rag_service import build_context

    fake_econ = {
        "fetched_at": 0.0,
        "federal_reserve:federal_funds_rate": {
            "valueType": "percent",
            "data": [{"date": "2026-06-27", "value": 4.33}],
        },
        "yfinance:gauges": {
            "valueType": "number",
            "series": {"VIX": [{"date": "2026-06-27", "value": 13.2}]},
        },
    }
    with patch("services.rag_service.get_econ_pool", return_value=fake_econ):
        context, sources = await build_context("fed funds rate today", ["economic"])

    assert "4.33" in context
    assert "VIX" in context
    assert any(s["type"] == "economic" for s in sources)


@pytest.mark.asyncio
async def test_build_context_news_only():
    from services.rag_service import build_context

    fake_articles = [
        {
            "id": "a1",
            "title": "Tesla Q2 beats",
            "description": "Tesla reported strong Q2.",
            "source": "Reuters",
            "category": "markets",
            "published_at": "2026-06-23T08:00:00Z",
            "url": "https://example.com/1",
        }
    ]

    with (
        patch("services.rag_service.get_news_pool", return_value=fake_articles),
        patch("services.rag_service.get_market_pool", return_value=None),
        patch("services.rag_service.get_analysis_pool", return_value=[]),
    ):
        context, sources = await build_context("Tesla berita terbaru", ["news"])

    assert "Tesla Q2 beats" in context
    assert any(s["type"] == "news" for s in sources)
