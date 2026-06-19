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
        category="finance",
        region="global",
        source="CNBC",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="bbc-business",
        name="BBC Business",
        url="https://feeds.bbci.co.uk/news/business/rss.xml",
        category="finance",
        region="global",
        source="BBC",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="coindesk",
        name="CoinDesk",
        url="https://www.coindesk.com/arc/outboundfeeds/rss/",
        category="crypto",
        region="global",
        source="COINDESK",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="sec-news",
        name="SEC Press Releases",
        url="https://www.sec.gov/news/pressreleases.rss",
        category="regulatory",
        region="us",
        source="SEC",
        tier=1,
        enabled=True,
    ),
    RSSFeedConfig(
        id="fxstreet-news",
        name="FXStreet News",
        url="https://www.fxstreet.com/rss/news",
        category="forex",
        region="global",
        source="FXSTREET",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="investing-news",
        name="Investing.com News",
        url="https://www.investing.com/rss/news.rss",
        category="markets",
        region="global",
        source="INVESTING.COM",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="oilprice-main",
        name="OilPrice.com",
        url="https://oilprice.com/rss/main",
        category="markets",
        region="global",
        source="OILPRICE.COM",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="theblock-trial",
        name="The Block",
        url="https://www.theblock.co/rss.xml",
        category="crypto",
        region="global",
        source="THE BLOCK",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="federal-reserve-press",
        name="Federal Reserve Press Releases",
        url="https://www.federalreserve.gov/feeds/press_all.xml",
        category="central_bank",
        region="us",
        source="FEDERAL RESERVE",
        tier=1,
        enabled=True,
    ),
    RSSFeedConfig(
        id="bank-of-england-news",
        name="Bank of England News",
        url="https://www.bankofengland.co.uk/rss/news",
        category="central_bank",
        region="uk",
        source="BANK OF ENGLAND",
        tier=1,
        enabled=True,
    ),
    RSSFeedConfig(
        id="wsj-markets",
        name="WSJ Markets",
        url="https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
        category="markets",
        region="global",
        source="WSJ",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="wsj-world",
        name="WSJ World",
        url="https://feeds.a.dj.com/rss/RSSWorldNews.xml",
        category="world",
        region="global",
        source="WSJ",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="cnbc-finance",
        name="CNBC Finance",
        url="https://www.cnbc.com/id/10000664/device/rss/rss.html",
        category="finance",
        region="global",
        source="CNBC",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="cnbc-world",
        name="CNBC World",
        url="https://www.cnbc.com/id/100727362/device/rss/rss.html",
        category="world",
        region="global",
        source="CNBC",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="cnbc-tech",
        name="CNBC Tech",
        url="https://www.cnbc.com/id/19854910/device/rss/rss.html",
        category="tech",
        region="global",
        source="CNBC",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="bbc-world",
        name="BBC World",
        url="https://feeds.bbci.co.uk/news/world/rss.xml",
        category="world",
        region="global",
        source="BBC",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="marketwatch-marketpulse",
        name="MarketWatch MarketPulse",
        url="https://www.marketwatch.com/rss/marketpulse",
        category="markets",
        region="global",
        source="MARKETWATCH",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="seeking-alpha-news",
        name="Seeking Alpha News",
        url="https://seekingalpha.com/market_currents.xml",
        category="markets",
        region="global",
        source="SEEKING ALPHA",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="cointelegraph-news",
        name="Cointelegraph News",
        url="https://cointelegraph.com/rss",
        category="crypto",
        region="global",
        source="COINTELEGRAPH",
        tier=2,
        enabled=True,
    ),
    RSSFeedConfig(
        id="wolf-street",
        name="Wolf Street",
        url="https://wolfstreet.com/feed",
        category="macro",
        region="global",
        source="WOLF STREET",
        tier=2,
        enabled=True,
    ),
)


GOOGLE_NEWS_FALLBACK_RSS_FEEDS: tuple[RSSFeedConfig, ...] = (
    RSSFeedConfig(
        id="bloomberg-markets-google-news",
        name="Bloomberg Markets via Google News",
        url=google_news_rss_url(
            (
                "site:bloomberg.com (markets OR economy OR stocks OR bonds OR currencies OR "
                + "commodities)"
            )
        ),
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
