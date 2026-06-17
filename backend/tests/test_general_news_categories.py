from __future__ import annotations

from dataclasses import dataclass

from tradingagents.dataflows.general_news_categories import map_general_news_category


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

    assert map_general_news_category(article) == "market"
