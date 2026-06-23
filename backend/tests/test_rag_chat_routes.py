from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

os.environ.setdefault("TRADINGAGENTS_SKIP_DOTENV", "true")
os.environ.setdefault("LLM_PROVIDER", "google")
os.environ.setdefault("QUICK_THINK_LLM", "gemini-2.0-flash")
os.environ.setdefault("LLM_API_KEY", "test-key")


def test_pool_status_endpoint(client):
    fake = {
        "news": {"available": True, "count": 10, "last_updated": "2026-06-23T10:00:00Z"},
        "market": {"available": True, "snapshot_at": "2026-06-23T10:00:00Z"},
        "analysis": {"available": False, "count": 0},
    }
    with patch("routes.rag_chat.get_pool_status", AsyncMock(return_value=fake)):
        r = client.get("/api/rag/pool/status")
    assert r.status_code == 200
    assert r.json()["news"]["available"] is True


def test_chat_out_of_scope(client):
    with patch("routes.rag_chat.check_scope", return_value=False):
        r = client.post("/api/rag/chat", json={"message": "Buatkan resep nasi goreng"})
    assert r.status_code == 200
    data = r.json()
    assert data["out_of_scope"] is True
    assert data["pool_used"] == []
    assert "di luar konteks" in data["answer"]


def test_chat_valid_with_data(client):
    fake_ctx = "=== NEWS DATA ===\n[NEWS] Tesla Q2 | Reuters"
    fake_src = [{"type": "news", "title": "Tesla Q2", "source": "Reuters"}]

    with (
        patch("routes.rag_chat.check_scope", return_value=True),
        patch("routes.rag_chat.detect_intent", return_value=["news"]),
        patch("routes.rag_chat.build_context", AsyncMock(return_value=(fake_ctx, fake_src))),
        patch("routes.rag_chat.call_rag_llm", AsyncMock(return_value="Tesla Q2 kuat.")),
    ):
        r = client.post("/api/rag/chat", json={"message": "Berita Tesla", "context_filter": "news"})

    assert r.status_code == 200
    data = r.json()
    assert data["out_of_scope"] is False
    assert "Tesla" in data["answer"]
    assert data["pool_used"] == ["news"]


def test_chat_empty_context_skips_llm(client):
    with (
        patch("routes.rag_chat.check_scope", return_value=True),
        patch("routes.rag_chat.detect_intent", return_value=["analysis"]),
        patch("routes.rag_chat.build_context", AsyncMock(return_value=("", []))),
        patch("routes.rag_chat.call_rag_llm", AsyncMock()) as mock_llm,
    ):
        r = client.post("/api/rag/chat", json={"message": "Analisis GOOGL?"})

    assert r.status_code == 200
    mock_llm.assert_not_called()
    assert "tidak ada data" in r.json()["answer"].lower()


def test_chat_with_watchlist_context(client):
    fake_ctx = "=== WATCHLIST DATA ===\n[WATCHLIST] group=Tech | AAPL | Apple | price=180"
    fake_src = [{"type": "watchlist", "symbol": "AAPL"}]

    with (
        patch("routes.rag_chat.check_scope", return_value=True),
        patch("routes.rag_chat.detect_intent", return_value=["watchlist"]),
        patch("routes.rag_chat.build_context", AsyncMock(return_value=(fake_ctx, fake_src))),
        patch("routes.rag_chat.call_rag_llm", AsyncMock(return_value="AAPL naik 2%.")),
    ):
        r = client.post(
            "/api/rag/chat",
            json={
                "message": "Saham mana di watchlist yang paling naik?",
                "context_filter": "watchlist",
                "watchlist_context": {
                    "groups": [
                        {"id": "g1", "name": "Tech", "items": [{"symbol": "AAPL", "name": "Apple"}]}
                    ],
                    "quotes": [{"sym": "AAPL", "price": 180.5, "chg": 2.1, "pos": True}],
                    "fetched_at": "2026-06-23T10:00:00Z",
                },
            },
        )

    assert r.status_code == 200
    assert r.json()["out_of_scope"] is False
