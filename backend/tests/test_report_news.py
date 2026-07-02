"""Unit tests for services/report/news.py — news section builders."""

from __future__ import annotations

from services.report.news import (
    _dedupe_report_news_items,
    _full_news_items,
    _report_news_sections,
    _safe_external_http_url,
)


def _article(title: str, url: str | None = None, **extra) -> dict:
    return {"title": title, "url": url, "publisher": "Reuters", **extra}


def test_dedupe_preserves_order_and_drops_duplicates():
    items = [
        _article("First", "https://a.com/1"),
        _article("Second", None),
        _article("First duplicate", "https://a.com/1"),  # same url → dup
        _article("Second", None),  # same title, no url → dup
        {"no_title": True},
        "not-a-dict",
    ]
    deduped = _dedupe_report_news_items(items)
    assert [item["title"] for item in deduped] == ["First", "Second"]


def test_report_news_sections_from_decision_and_market_news():
    result = {
        "news_context": {
            "decision_company_news": [_article("Company move")],
            "market_context_news": [_article("Macro shift")],
        }
    }
    sections = _report_news_sections(result)
    assert [section["title"] for section in sections] == [
        "Company News Used for Decision",
        "Market Context News",
    ]
    assert sections[0]["items"][0]["title"] == "Company move"


def test_report_news_sections_fallback_to_articles_then_empty():
    articles = {"news_context": {"articles": [_article("Only article")]}}
    sections = _report_news_sections(articles)
    assert sections == [{"title": "News", "items": sections[0]["items"]}]
    assert sections[0]["items"][0]["title"] == "Only article"

    assert _report_news_sections({}) == []
    assert _report_news_sections({"news_context": {"articles": []}}) == []


def test_full_news_items_excludes_high_impact_duplicates():
    high = _article("Big news", "https://a.com/big")
    result = {
        "news_impact": {
            "high_impact_news": [high],
            "full_news_list": [high, _article("Minor news", "https://a.com/minor")],
        }
    }
    items = _full_news_items(result)
    assert [item["title"] for item in items] == ["Minor news"]


def test_safe_external_http_url():
    assert _safe_external_http_url("https://example.com/x") == "https://example.com/x"
    assert _safe_external_http_url("http://example.com") == "http://example.com"
    assert _safe_external_http_url("javascript:alert(1)") is None
    assert _safe_external_http_url("ftp://example.com") is None
    assert _safe_external_http_url("") is None
    assert _safe_external_http_url("https://") is None
