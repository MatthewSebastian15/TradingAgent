from types import SimpleNamespace

from tradingagents.dataflows.providers import yfinance_news


def _article(title, pub_date, publisher="Reuters", url="https://example.com/a"):
    return {
        "content": {
            "title": title,
            "summary": f"Summary of {title}",
            "provider": {"displayName": publisher},
            "canonicalUrl": {"url": url},
            "pubDate": pub_date,
        }
    }


def _patch_ticker_news(monkeypatch, news):
    monkeypatch.setattr(yfinance_news, "yf_retry", lambda func: func())
    monkeypatch.setattr(
        yfinance_news,
        "yf",
        SimpleNamespace(Ticker=lambda _symbol: SimpleNamespace(get_news=lambda count=20: news)),
    )


def test_news_mapped_and_date_filtered(monkeypatch):
    _patch_ticker_news(
        monkeypatch,
        [
            _article("In Range", "2026-06-15T10:00:00Z"),
            _article("Too Old", "2025-01-01T10:00:00Z"),
        ],
    )
    result = yfinance_news.get_news_yfinance("AAPL", "2026-06-01", "2026-06-30")
    assert "## AAPL News, from 2026-06-01 to 2026-06-30" in result
    assert "### In Range (source: Reuters)" in result
    assert "Summary of In Range" in result
    assert "Link: https://example.com/a" in result
    assert "Too Old" not in result


def test_flat_structure_fallback(monkeypatch):
    _patch_ticker_news(
        monkeypatch, [{"title": "Flat Story", "publisher": "AP", "link": "", "summary": ""}]
    )
    result = yfinance_news.get_news_yfinance("AAPL", "2026-06-01", "2026-06-30")
    assert "### Flat Story (source: AP)" in result


def test_empty_feed(monkeypatch):
    _patch_ticker_news(monkeypatch, [])
    assert yfinance_news.get_news_yfinance("AAPL", "2026-06-01", "2026-06-30") == (
        "No news found for AAPL"
    )


def test_all_filtered_out(monkeypatch):
    _patch_ticker_news(monkeypatch, [_article("Too Old", "2020-01-01T10:00:00Z")])
    result = yfinance_news.get_news_yfinance("AAPL", "2026-06-01", "2026-06-30")
    assert result == "No news found for AAPL between 2026-06-01 and 2026-06-30"


def test_vendor_error_mapped_to_message(monkeypatch):
    monkeypatch.setattr(yfinance_news, "yf_retry", lambda func: func())
    monkeypatch.setattr(
        yfinance_news,
        "yf",
        SimpleNamespace(Ticker=lambda _symbol: (_ for _ in ()).throw(RuntimeError("offline"))),
    )
    result = yfinance_news.get_news_yfinance("AAPL", "2026-06-01", "2026-06-30")
    assert result.startswith("Error fetching news for AAPL:")


def test_global_news_dedupes_titles(monkeypatch):
    search_result = SimpleNamespace(
        news=[
            _article("Macro Story", "2026-07-01T10:00:00Z"),
            _article("Macro Story", "2026-07-01T10:00:00Z"),  # duplicate title
        ]
    )
    monkeypatch.setattr(yfinance_news, "yf_retry", lambda func: func())
    monkeypatch.setattr(yfinance_news, "yf", SimpleNamespace(Search=lambda **kwargs: search_result))
    result = yfinance_news.get_global_news_yfinance("2026-07-03", look_back_days=7, limit=10)
    assert result.count("### Macro Story") == 1


def test_global_news_empty(monkeypatch):
    monkeypatch.setattr(yfinance_news, "yf_retry", lambda func: func())
    monkeypatch.setattr(
        yfinance_news, "yf", SimpleNamespace(Search=lambda **kwargs: SimpleNamespace(news=[]))
    )
    result = yfinance_news.get_global_news_yfinance("2026-07-03")
    assert result == "No global news found for 2026-07-03"
