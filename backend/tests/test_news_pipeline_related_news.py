from __future__ import annotations

import importlib
import sys
import types

# Keep this backend unit test isolated from optional market-data runtime dependencies.
yfinance_stub = types.ModuleType("yfinance")
yfinance_stub.download = lambda *args, **kwargs: None
yfinance_stub.Ticker = lambda *args, **kwargs: types.SimpleNamespace()
yfinance_exceptions_stub = types.ModuleType("yfinance.exceptions")
yfinance_exceptions_stub.YFRateLimitError = type("YFRateLimitError", (Exception,), {})
yfinance_stub.exceptions = yfinance_exceptions_stub
sys.modules.setdefault("yfinance", yfinance_stub)
sys.modules.setdefault("yfinance.exceptions", yfinance_exceptions_stub)

stockstats_stub = types.ModuleType("stockstats")
stockstats_stub.wrap = lambda data: data
sys.modules.setdefault("stockstats", stockstats_stub)

_build_related_news = importlib.import_module(
    "tradingagents.pipeline.orchestrator"
)._build_related_news


def _context_articles(count: int) -> list[dict[str, object]]:
    titles = [
        "GOTO releases quarterly laba bersih report",
        "GOTO sets dividend distribution calendar",
        "GOTO obtains shareholder approval for rights issue",
        "GOTO updates free float after index review",
        "GOTO receives OJK request for extra disclosure",
        "GOTO appoints new technology director",
        "GOTO reports strategic ownership change",
        "GOTO bond outlook upgraded by rating agency",
        "GOTO signs logistics partnership contract",
        "GOTO expands merchant financing project",
        "GOTO completes treasury share buyback phase",
        "GOTO publishes annual report filing",
    ]
    return [
        {
            "title": titles[i],
            "url": f"https://example.com/related/{i}?utm_source=test",
            "source": "IDX",
            "provider": "newsdata",
            "published_at": "2026-06-02",
            "summary": f"GOTO related company update number {i}.",
            "event_type": "earnings",
            "ticker": "GOTO.JK",
            "relevance_score": 90,
        }
        for i in range(count)
    ]


def test_build_related_news_does_not_apply_fixed_limit():
    result = _build_related_news(
        ticker="GOTO.JK",
        trade_date="2026-06-02",
        company_news=None,
        global_news=None,
        source_label="newsdata",
        news_context={"articles": _context_articles(12)},
    )

    assert result["available"] is True
    assert len(result["items"]) == 12


def test_build_related_news_deduplicates_before_returning_items():
    articles = _context_articles(3)
    articles.append({**articles[0], "url": "https://example.com/related/0?utm_campaign=duplicate"})

    result = _build_related_news(
        ticker="GOTO.JK",
        trade_date="2026-06-02",
        company_news=None,
        global_news=None,
        source_label="newsdata",
        news_context={"articles": articles},
    )

    assert result["available"] is True
    assert len(result["items"]) == 3
