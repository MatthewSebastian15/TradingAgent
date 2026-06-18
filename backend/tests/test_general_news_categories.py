from __future__ import annotations

from dataclasses import dataclass

from tradingagents.dataflows.general_news_categories import (
    allowed_category_keys,
    map_general_news_category,
    normalize_general_news_category,
)


@dataclass
class FakeArticle:
    title: str
    summary: str
    source: str


def test_crypto_category_mapping():
    article = FakeArticle(
        title="Bitcoin rises after ETF inflows",
        summary="Crypto market gains",
        source="CoinDesk",
    )

    assert map_general_news_category(article) == "crypto"


def test_rupiah_news_maps_to_forex_without_indonesia_category():
    article = FakeArticle(
        title="Rupiah steadies before Bank Indonesia decision",
        summary="Jakarta markets watch BI rate guidance",
        source="Unknown",
    )

    assert map_general_news_category(article) == "forex"


def test_default_category_mapping_is_market():
    article = FakeArticle(
        title="Business leaders comment on revenue outlook",
        summary="General business update",
        source="Unknown",
    )

    assert map_general_news_category(article) == "markets"


def test_final_category_set_excludes_indonesia():
    assert allowed_category_keys() == {
        "all",
        "markets",
        "world",
        "finance",
        "tech",
        "macro",
        "central_bank",
        "regulatory",
        "forex",
        "crypto",
    }
    assert "indonesia" not in allowed_category_keys()


def test_legacy_categories_normalize_safely():
    assert normalize_general_news_category("market") == "markets"
    assert normalize_general_news_category("business") == "finance"
    assert normalize_general_news_category("commodities") == "markets"
    assert normalize_general_news_category("energy") == "markets"
    assert normalize_general_news_category("central-bank") == "central_bank"
    assert normalize_general_news_category("centralbank") == "central_bank"


def test_feed_category_overrides_source_category():
    article = {
        "title": "CNBC world story",
        "summary": "Global diplomacy update",
        "source": "CNBC",
        "category": "world",
    }

    assert map_general_news_category(article) == "world"
