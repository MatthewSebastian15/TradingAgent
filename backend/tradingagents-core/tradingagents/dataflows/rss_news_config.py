from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote_plus


@dataclass(frozen=True)
class RSSFeedConfig:
    id: str
    name: str
    url: str
    category: str
    region: str
    source: str
    tier: int = 2
    enabled: bool = True
    is_google_news_fallback: bool = False


def google_news_rss_url(
    query: str,
    *,
    hl: str = "en-US",
    gl: str = "US",
    ceid: str = "US:en",
) -> str:
    return f"https://news.google.com/rss/search?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={quote_plus(ceid)}"


DEFAULT_RSS_FEEDS: tuple[RSSFeedConfig, ...] = (
    RSSFeedConfig(
        id="cnbc-business",
        name="CNBC Business",
        url="https://www.cnbc.com/id/10001147/device/rss/rss.html",
        category="business",
        region="global",
        source="CNBC",
    ),
    RSSFeedConfig(
        id="bbc-business",
        name="BBC Business",
        url="https://feeds.bbci.co.uk/news/business/rss.xml",
        category="business",
        region="global",
        source="BBC",
    ),
    RSSFeedConfig(
        id="coindesk",
        name="CoinDesk",
        url="https://www.coindesk.com/arc/outboundfeeds/rss/",
        category="crypto",
        region="global",
        source="COINDESK",
    ),
    RSSFeedConfig(
        id="sec-news",
        name="SEC News",
        url="https://www.sec.gov/news/pressreleases.rss",
        category="regulatory",
        region="us",
        source="SEC",
        tier=1,
    ),
    RSSFeedConfig(
        id="fxstreet-news",
        name="FXStreet News",
        url="https://www.fxstreet.com/rss/news",
        category="forex",
        region="global",
        source="FXSTREET",
    ),
    RSSFeedConfig(
        id="investing-news",
        name="Investing.com News",
        url="https://www.investing.com/rss/news.rss",
        category="markets",
        region="global",
        source="INVESTING.COM",
    ),
    RSSFeedConfig(
        id="oilprice-main",
        name="OilPrice.com",
        url="https://oilprice.com/rss/main",
        category="energy",
        region="global",
        source="OILPRICE.COM",
    ),
    RSSFeedConfig(
        id="theblock-trial",
        name="The Block",
        url="https://www.theblock.co/rss.xml",
        category="crypto",
        region="global",
        source="THE BLOCK",
        tier=3,
        enabled=False,
    ),
)


GOOGLE_NEWS_FALLBACK_RSS_FEEDS: tuple[RSSFeedConfig, ...] = (
    RSSFeedConfig(
        id="bloomberg-google-news",
        name="Bloomberg via Google News",
        url=google_news_rss_url("site:bloomberg.com (markets OR economy OR stocks OR bonds OR currencies)"),
        category="markets",
        region="global",
        source="BLOOMBERG",
        tier=3,
        enabled=True,
        is_google_news_fallback=True,
    ),
    RSSFeedConfig(
        id="economist-google-news",
        name="The Economist via Google News",
        url=google_news_rss_url("site:economist.com (finance OR economics OR markets OR business)"),
        category="macro",
        region="global",
        source="THE ECONOMIST",
        tier=3,
        enabled=True,
        is_google_news_fallback=True,
    ),
)
