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
