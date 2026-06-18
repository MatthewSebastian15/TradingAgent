from __future__ import annotations

from typing import Any

from tradingagents.dataflows.news_intelligence import build_news_impact


def _article(
    index: int,
    *,
    title: str,
    summary: str,
    event_type: str,
    ticker: str | None = None,
    source: str = "Reuters",
    relevance_score: int = 88,
) -> dict[str, Any]:
    return {
        "title": title,
        "url": f"https://example.com/news/{event_type}/{index}",
        "source": source,
        "publisher": source,
        "published_at": "2026-06-02",
        "summary": summary,
        "relevance_score": relevance_score,
        "event_type": event_type,
        "related_ticker": ticker,
    }


def _high_impact_articles(ticker: str = "GOTO.JK") -> list[dict[str, Any]]:
    base = ticker.removesuffix(".JK")
    rows = [
        (
            "earnings",
            f"{base} reports laba bersih and revenue improvement",
            "Kinerja keuangan membaik.",
        ),
        (
            "dividend",
            f"{base} announces dividend cum date schedule",
            "Pembagian dividen baru diumumkan.",
        ),
        (
            "corporate_action",
            f"{base} approves rights issue and private placement plan",
            "Aksi korporasi material.",
        ),
        (
            "index",
            f"FTSE removes {base} from Indonesia index",
            "Removed due to free float and liquidity criteria.",
        ),
        (
            "regulatory",
            f"OJK reviews {base} disclosure after market suspension",
            "Regulatory review is material.",
        ),
        (
            "management",
            f"{base} appoints new chief financial officer",
            "Pergantian manajemen diumumkan.",
        ),
        (
            "shareholder",
            f"{base} discloses pemegang saham pengendali update",
            "Kepemilikan saham berubah.",
        ),
        (
            "debt_rating",
            f"Rating agency upgrades {base} bond outlook",
            "Peringkat obligasi berubah.",
        ),
        (
            "major_contract",
            f"{base} signs major project partnership contract",
            "Kontrak proyek bernilai besar.",
        ),
    ]
    return [
        _article(i, title=title, summary=summary, event_type=event_type, ticker=ticker)
        for i, (event_type, title, summary) in enumerate(rows)
    ]


def _market_context_articles(count: int = 14) -> list[dict[str, Any]]:
    topics = [
        "Asian markets rally on US inflation data",
        "Rupiah strengthens as regional currencies rebound",
        "Bank Indonesia holds benchmark interest rate",
        "Commodity prices move higher after supply disruption",
        "Global market volatility eases before Fed decision",
        "Indonesia consumer confidence improves in latest survey",
        "Regional technology shares trade mixed after Nasdaq move",
        "Oil prices decline after inventory report",
        "Coal benchmark price rises amid seasonal demand",
        "ASEAN equities gain as foreign inflows recover",
        "Inflation outlook cools across emerging Asia",
        "Local bond yields fall after auction demand improves",
        "Market breadth improves as blue chips stabilize",
        "Currency traders await central bank guidance",
    ]
    return [
        _article(
            i,
            title=topics[i],
            summary="Regional market update without direct issuer reference.",
            event_type="market_context",
            ticker=None,
            source="NewsData",
            relevance_score=66,
        )
        for i in range(count)
    ]


def test_high_impact_news_is_not_limited():
    articles = _high_impact_articles("GOTO.JK")
    result = build_news_impact("GOTO.JK", "2026-06-02", news_context={"articles": articles})

    assert result["high_impact_count"] == 9
    assert len(result["high_impact_news"]) == 9
    assert result["data_quality"]["rules"]["high_impact_limited"] is False


def test_full_news_list_is_not_limited():
    articles = _market_context_articles(14)
    result = build_news_impact("GOTO.JK", "2026-06-02", news_context={"articles": articles})

    assert result["full_news_count"] == 14
    assert len(result["full_news_list"]) == 14
    assert result["data_quality"]["rules"]["full_news_limited"] is False


def test_high_impact_is_removed_from_full_news_list():
    articles = _high_impact_articles("GOTO.JK")[:5] + _market_context_articles(7)
    result = build_news_impact("GOTO.JK", "2026-06-02", news_context={"articles": articles})

    high_keys = {item["dedupe_key"] for item in result["high_impact_news"]}
    full_keys = {item["dedupe_key"] for item in result["full_news_list"]}

    assert result["high_impact_count"] == 5
    assert result["full_news_count"] == 7
    assert high_keys.isdisjoint(full_keys)


def test_market_context_without_direct_ticker_stays_in_full_news():
    articles = [
        {
            "title": "Asian Markets Rally on US Inflation Data",
            "url": "https://example.com/asian-markets-rally",
            "source": "NewsData",
            "published_at": "2026-06-02",
            "summary": "Regional market update without direct issuer reference.",
            "relevance_score": 66,
            "event_type": "market_context",
        }
    ]
    result = build_news_impact("GOTO.JK", "2026-06-02", news_context={"articles": articles})

    assert len(result["high_impact_news"]) == 0
    assert len(result["full_news_list"]) == 1
    assert result["full_news_list"][0]["news_scope"] == "market_context"
    assert result["full_news_list"][0]["is_high_impact"] is False


def test_index_exclusion_with_direct_ticker_is_high_impact():
    articles = [
        {
            "title": "FTSE removes GOTO from Indonesia index",
            "url": "https://example.com/ftse-goto",
            "source": "Reuters",
            "published_at": "2026-06-02",
            "summary": "GOTO is removed due to free float and liquidity criteria.",
            "relevance_score": 88,
            "event_type": "index",
        }
    ]
    result = build_news_impact("GOTO.JK", "2026-06-02", news_context={"articles": articles})

    assert len(result["high_impact_news"]) == 1
    assert result["high_impact_news"][0]["materiality_category"] == "index"
    assert result["high_impact_news"][0]["news_scope"] == "company"


def test_indonesian_materiality_keywords_are_supported():
    articles = [
        {
            "title": "GOTO umumkan laba bersih dan pendapatan terbaru",
            "url": "https://example.com/goto-laba",
            "source": "Kontan",
            "published_at": "2026-06-02",
            "summary": "Kinerja keuangan GOTO membaik.",
            "relevance_score": 86,
            "event_type": "earnings",
        }
    ]
    result = build_news_impact("GOTO.JK", "2026-06-02", news_context={"articles": articles})

    assert result["high_impact_news"][0]["materiality_category"] == "earnings"
    assert result["high_impact_news"][0]["source_confidence_label"] == "HIGH"
    assert result["high_impact_news"][0]["impact_reason"]
