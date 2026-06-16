from __future__ import annotations

MARKET_PRESETS: dict[str, list[dict[str, str]]] = {
    "EQUITIES": [
        {"label": "S&P 500", "symbol": "^GSPC"},
        {"label": "NASDAQ", "symbol": "^IXIC"},
        {"label": "DOW JONES", "symbol": "^DJI"},
        {"label": "RUSSELL 2000", "symbol": "^RUT"},
        {"label": "VIX", "symbol": "^VIX"},
        {"label": "DOLLAR DXY", "symbol": "DX-Y.NYB"},
        {"label": "FTSE 100", "symbol": "^FTSE"},
        {"label": "DAX", "symbol": "^GDAXI"},
        {"label": "NIKKEI 225", "symbol": "^N225"},
        {"label": "HANG SENG", "symbol": "^HSI"},
    ],
    "FX": [
        {"label": "EUR/USD", "symbol": "EURUSD=X"},
        {"label": "GBP/USD", "symbol": "GBPUSD=X"},
        {"label": "USD/JPY", "symbol": "JPY=X"},
        {"label": "USD/CHF", "symbol": "CHF=X"},
        {"label": "USD/CAD", "symbol": "CAD=X"},
        {"label": "AUD/USD", "symbol": "AUDUSD=X"},
    ],
    "COMMODITIES": [
        {"label": "GOLD", "symbol": "GC=F"},
        {"label": "SILVER", "symbol": "SI=F"},
        {"label": "CRUDE OIL WTI", "symbol": "CL=F"},
        {"label": "BRENT OIL", "symbol": "BZ=F"},
        {"label": "NATURAL GAS", "symbol": "NG=F"},
        {"label": "COPPER", "symbol": "HG=F"},
    ],
    "FIXED_INCOME": [
        {"label": "US 10Y YIELD", "symbol": "^TNX"},
        {"label": "US 5Y YIELD", "symbol": "^FVX"},
        {"label": "US 30Y YIELD", "symbol": "^TYX"},
        {"label": "US 13W BILL", "symbol": "^IRX"},
    ],
    "CRYPTO": [
        {"label": "BITCOIN", "symbol": "BTC-USD"},
        {"label": "ETHEREUM", "symbol": "ETH-USD"},
        {"label": "SOLANA", "symbol": "SOL-USD"},
        {"label": "BNB", "symbol": "BNB-USD"},
        {"label": "XRP", "symbol": "XRP-USD"},
        {"label": "DOGECOIN", "symbol": "DOGE-USD"},
    ],
}

MARKET_LABELS: dict[str, str] = {item["symbol"]: item["label"] for values in MARKET_PRESETS.values() for item in values}

MARKET_SYMBOL_UNIVERSE: dict[str, list[str]] = {
    "US:NASDAQ": ["AAPL", "MSFT", "NVDA", "TSLA", "META", "GOOGL", "AMZN", "NFLX"],
    "US:NYSE": ["JPM", "UNH", "XOM", "V", "MA", "JNJ", "WMT", "BAC"],
    "ID:IDX": ["BBCA.JK", "BBRI.JK", "BMRI.JK", "TLKM.JK", "ASII.JK", "UNTR.JK"],
    "JP:TSE": ["7203.T", "6758.T", "9984.T", "8306.T"],
    "GB:LSE": ["HSBA.L", "BP.L", "AZN.L", "ULVR.L"],
    "HK:HKEX": ["0700.HK", "9988.HK", "0005.HK", "0939.HK"],
}

MARKET_SEARCH_UNIVERSE: list[dict[str, str]] = [
    {"symbol": "AAPL", "name": "Apple Inc", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "MSFT", "name": "Microsoft Corporation", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "NVDA", "name": "NVIDIA Corporation", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "META", "name": "Meta Platforms Inc", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "GOOGL", "name": "Alphabet Inc Class A", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "AMZN", "name": "Amazon.com Inc", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "TSLA", "name": "Tesla Inc", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "AVGO", "name": "Broadcom Inc", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "NFLX", "name": "Netflix Inc", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "AMD", "name": "Advanced Micro Devices Inc", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "INTC", "name": "Intel Corporation", "exchange": "NASDAQ", "type": "EQUITY", "market": "US"},
    {"symbol": "JPM", "name": "JPMorgan Chase & Co", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "BAC", "name": "Bank of America Corporation", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "V", "name": "Visa Inc", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "MA", "name": "Mastercard Incorporated", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "UNH", "name": "UnitedHealth Group Incorporated", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "LLY", "name": "Eli Lilly and Company", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "JNJ", "name": "Johnson & Johnson", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "XOM", "name": "Exxon Mobil Corporation", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "WMT", "name": "Walmart Inc", "exchange": "NYSE", "type": "EQUITY", "market": "US"},
    {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "exchange": "NYSEARCA", "type": "ETF", "market": "US"},
    {"symbol": "QQQ", "name": "Invesco QQQ Trust", "exchange": "NASDAQ", "type": "ETF", "market": "US"},
    {"symbol": "BBCA.JK", "name": "Bank Central Asia Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {
        "symbol": "BBRI.JK",
        "name": "Bank Rakyat Indonesia Persero Tbk PT",
        "exchange": "IDX",
        "type": "EQUITY",
        "market": "ID",
    },
    {"symbol": "BMRI.JK", "name": "Bank Mandiri Persero Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {
        "symbol": "BBNI.JK",
        "name": "Bank Negara Indonesia Persero Tbk PT",
        "exchange": "IDX",
        "type": "EQUITY",
        "market": "ID",
    },
    {
        "symbol": "TLKM.JK",
        "name": "Telkom Indonesia Persero Tbk PT",
        "exchange": "IDX",
        "type": "EQUITY",
        "market": "ID",
    },
    {"symbol": "ASII.JK", "name": "Astra International Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {"symbol": "UNTR.JK", "name": "United Tractors Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {"symbol": "UNVR.JK", "name": "Unilever Indonesia Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {"symbol": "GOTO.JK", "name": "GoTo Gojek Tokopedia Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {"symbol": "ANTM.JK", "name": "Aneka Tambang Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {"symbol": "INCO.JK", "name": "Vale Indonesia Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {
        "symbol": "ADRO.JK",
        "name": "Alamtri Resources Indonesia Tbk PT",
        "exchange": "IDX",
        "type": "EQUITY",
        "market": "ID",
    },
    {"symbol": "TPIA.JK", "name": "Chandra Asri Pacific Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {"symbol": "PTRO.JK", "name": "Petrosea Tbk PT", "exchange": "IDX", "type": "EQUITY", "market": "ID"},
    {"symbol": "700.HK", "name": "Tencent Holdings Limited", "exchange": "HKEX", "type": "EQUITY", "market": "HK"},
    {
        "symbol": "9988.HK",
        "name": "Alibaba Group Holding Limited",
        "exchange": "HKEX",
        "type": "EQUITY",
        "market": "HK",
    },
    {"symbol": "7203.T", "name": "Toyota Motor Corporation", "exchange": "TSE", "type": "EQUITY", "market": "JP"},
    {"symbol": "^GSPC", "name": "S&P 500 Index", "exchange": "SNP", "type": "INDEX", "market": "US"},
    {"symbol": "^IXIC", "name": "NASDAQ Composite", "exchange": "NASDAQ", "type": "INDEX", "market": "US"},
    {"symbol": "^DJI", "name": "Dow Jones Industrial Average", "exchange": "DJI", "type": "INDEX", "market": "US"},
    {"symbol": "^VIX", "name": "CBOE Volatility Index", "exchange": "CBOE", "type": "INDEX", "market": "US"},
    {"symbol": "^JKSE", "name": "Jakarta Composite Index", "exchange": "IDX", "type": "INDEX", "market": "ID"},
    {"symbol": "BTC-USD", "name": "Bitcoin USD", "exchange": "CCC", "type": "CRYPTO", "market": "CRYPTO"},
    {"symbol": "ETH-USD", "name": "Ethereum USD", "exchange": "CCC", "type": "CRYPTO", "market": "CRYPTO"},
    {"symbol": "SOL-USD", "name": "Solana USD", "exchange": "CCC", "type": "CRYPTO", "market": "CRYPTO"},
    {"symbol": "ES=F", "name": "E-mini S&P 500 Futures", "exchange": "CME", "type": "FUTURE", "market": "US"},
    {"symbol": "NQ=F", "name": "E-mini NASDAQ 100 Futures", "exchange": "CME", "type": "FUTURE", "market": "US"},
    {"symbol": "CL=F", "name": "Crude Oil Futures", "exchange": "NYMEX", "type": "FUTURE", "market": "US"},
    {"symbol": "GC=F", "name": "Gold Futures", "exchange": "COMEX", "type": "FUTURE", "market": "US"},
]

MARKET_EXCHANGE_PRESETS: list[dict[str, str]] = [
    {"country": "United States", "country_code": "US", "exchange": "NASDAQ", "suffix": ""},
    {"country": "United States", "country_code": "US", "exchange": "NYSE", "suffix": ""},
    {"country": "Indonesia", "country_code": "ID", "exchange": "IDX", "suffix": ".JK"},
    {"country": "Japan", "country_code": "JP", "exchange": "TSE", "suffix": ".T"},
    {"country": "United Kingdom", "country_code": "GB", "exchange": "LSE", "suffix": ".L"},
    {"country": "Germany", "country_code": "DE", "exchange": "XETRA", "suffix": ".DE"},
    {"country": "France", "country_code": "FR", "exchange": "Euronext Paris", "suffix": ".PA"},
    {"country": "Hong Kong", "country_code": "HK", "exchange": "HKEX", "suffix": ".HK"},
    {"country": "Singapore", "country_code": "SG", "exchange": "SGX", "suffix": ".SI"},
    {"country": "Australia", "country_code": "AU", "exchange": "ASX", "suffix": ".AX"},
    {"country": "Canada", "country_code": "CA", "exchange": "TSX", "suffix": ".TO"},
]

_COUNTRY_ALIASES = {
    "UNITED STATES": "US",
    "USA": "US",
    "US": "US",
    "INDONESIA": "ID",
    "ID": "ID",
    "JAPAN": "JP",
    "JP": "JP",
    "UNITED KINGDOM": "GB",
    "UK": "GB",
    "GB": "GB",
    "GERMANY": "DE",
    "DE": "DE",
    "FRANCE": "FR",
    "FR": "FR",
    "HONG KONG": "HK",
    "HK": "HK",
    "SINGAPORE": "SG",
    "SG": "SG",
    "AUSTRALIA": "AU",
    "AU": "AU",
    "CANADA": "CA",
    "CA": "CA",
}


def normalize_country(country: str) -> str:
    normalized = str(country or "").strip().upper()
    return _COUNTRY_ALIASES.get(normalized, normalized)


def normalize_exchange(exchange: str) -> str:
    return str(exchange or "").strip()


def universe_key(country: str, exchange: str) -> str:
    return f"{normalize_country(country)}:{normalize_exchange(exchange).upper()}"


def get_symbol_universe(country: str, exchange: str) -> list[str]:
    return list(MARKET_SYMBOL_UNIVERSE.get(universe_key(country, exchange), MARKET_SYMBOL_UNIVERSE["US:NASDAQ"]))


def get_exchange_preset(country: str, exchange: str) -> dict[str, str] | None:
    normalized_country = normalize_country(country)
    normalized_exchange = normalize_exchange(exchange).upper()
    for preset in MARKET_EXCHANGE_PRESETS:
        if preset["country_code"] == normalized_country and preset["exchange"].upper() == normalized_exchange:
            return dict(preset)
    return None
