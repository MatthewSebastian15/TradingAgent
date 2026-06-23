from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def clear_pool_cache():
    import services.rag_pool as pool
    pool._news_cache = None
    pool._market_cache = None
    yield
    pool._news_cache = None
    pool._market_cache = None


@pytest.mark.asyncio
async def test_get_news_pool_returns_articles():
    from services.rag_pool import get_news_pool

    mock_result = MagicMock()
    mock_result.articles = [{"id": "1", "title": "Test"}]
    mock_result.last_updated = "2026-06-23T10:00:00Z"

    with patch("services.rag_pool.NewsArticleStore") as MockStore:
        MockStore.return_value.list_articles.return_value = mock_result
        articles = await get_news_pool()

    assert articles == [{"id": "1", "title": "Test"}]


@pytest.mark.asyncio
async def test_get_news_pool_caches_result():
    from services.rag_pool import get_news_pool

    mock_result = MagicMock()
    mock_result.articles = [{"id": "1"}]
    mock_result.last_updated = "2026-06-23T10:00:00Z"

    with patch("services.rag_pool.NewsArticleStore") as MockStore:
        MockStore.return_value.list_articles.return_value = mock_result
        await get_news_pool()
        await get_news_pool()
        assert MockStore.call_count == 1  # second call hits cache


@pytest.mark.asyncio
async def test_get_analysis_pool_returns_list():
    from services.rag_pool import get_analysis_pool

    mock_repo = MagicMock()
    mock_repo.list_analyses.return_value = [{"ticker": "META", "decision": "HOLD"}]

    with patch("services.rag_pool.get_analysis_repository", return_value=mock_repo):
        result = await get_analysis_pool()

    assert result == [{"ticker": "META", "decision": "HOLD"}]


@pytest.mark.asyncio
async def test_get_pool_status_empty():
    from services.rag_pool import get_pool_status

    with (
        patch("services.rag_pool.get_news_pool", return_value=[]),
        patch("services.rag_pool.get_market_pool", return_value=None),
        patch("services.rag_pool.get_analysis_pool", return_value=[]),
    ):
        status = await get_pool_status()

    assert status["news"]["available"] is False
    assert status["market"]["available"] is False
    assert status["analysis"]["available"] is False
