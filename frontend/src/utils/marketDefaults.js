export const MARKET_STORAGE_KEY = 'market_overview_symbols_v1';
export const MARKET_MIN_SYMBOLS = 3;
export const MARKET_MAX_SYMBOLS = 6;
export const MARKET_DEFAULT_CATEGORY = 'EQUITIES';

export const MARKET_CATEGORY_LABELS = {
  EQUITIES: 'EQUITIES',
  FX: 'FX',
  COMMODITIES: 'COMMODITIES',
  FIXED_INCOME: 'FIXED INCOME',
  CRYPTO: 'CRYPTO',
};

export const MARKET_CATEGORIES = ['EQUITIES', 'FX', 'COMMODITIES', 'FIXED_INCOME', 'CRYPTO'];

export const MARKET_PRESETS = {
  EQUITIES: [
    { label: 'S&P 500', symbol: '^GSPC' },
    { label: 'NASDAQ', symbol: '^IXIC' },
    { label: 'DOW JONES', symbol: '^DJI' },
    { label: 'RUSSELL 2000', symbol: '^RUT' },
    { label: 'VIX', symbol: '^VIX' },
    { label: 'DOLLAR DXY', symbol: 'DX-Y.NYB' },
    { label: 'FTSE 100', symbol: '^FTSE' },
    { label: 'DAX', symbol: '^GDAXI' },
    { label: 'NIKKEI 225', symbol: '^N225' },
    { label: 'HANG SENG', symbol: '^HSI' },
  ],
  FX: [
    { label: 'EUR/USD', symbol: 'EURUSD=X' },
    { label: 'GBP/USD', symbol: 'GBPUSD=X' },
    { label: 'USD/JPY', symbol: 'JPY=X' },
    { label: 'USD/CHF', symbol: 'CHF=X' },
    { label: 'USD/CAD', symbol: 'CAD=X' },
    { label: 'AUD/USD', symbol: 'AUDUSD=X' },
  ],
  COMMODITIES: [
    { label: 'GOLD', symbol: 'GC=F' },
    { label: 'SILVER', symbol: 'SI=F' },
    { label: 'CRUDE OIL WTI', symbol: 'CL=F' },
    { label: 'BRENT OIL', symbol: 'BZ=F' },
    { label: 'NATURAL GAS', symbol: 'NG=F' },
    { label: 'COPPER', symbol: 'HG=F' },
  ],
  FIXED_INCOME: [
    { label: 'US 10Y YIELD', symbol: '^TNX' },
    { label: 'US 5Y YIELD', symbol: '^FVX' },
    { label: 'US 30Y YIELD', symbol: '^TYX' },
    { label: 'US 13W BILL', symbol: '^IRX' },
  ],
  CRYPTO: [
    { label: 'BITCOIN', symbol: 'BTC-USD' },
    { label: 'ETHEREUM', symbol: 'ETH-USD' },
    { label: 'SOLANA', symbol: 'SOL-USD' },
    { label: 'BNB', symbol: 'BNB-USD' },
    { label: 'XRP', symbol: 'XRP-USD' },
    { label: 'DOGECOIN', symbol: 'DOGE-USD' },
  ],
};

export const MARKET_DEFAULT_SYMBOLS = MARKET_PRESETS.EQUITIES.slice(0, MARKET_MAX_SYMBOLS).map(
  (item) => item.symbol
);

export const MARKET_MOVERS_LIMIT = 5;

export const MARKET_EXCHANGE_PRESETS = [
  { country: 'United States', countryCode: 'US', exchange: 'NASDAQ', suffix: '' },
  { country: 'United States', countryCode: 'US', exchange: 'NYSE', suffix: '' },
  { country: 'Indonesia', countryCode: 'ID', exchange: 'IDX', suffix: '.JK' },
  { country: 'Japan', countryCode: 'JP', exchange: 'TSE', suffix: '.T' },
  { country: 'United Kingdom', countryCode: 'GB', exchange: 'LSE', suffix: '.L' },
  { country: 'Germany', countryCode: 'DE', exchange: 'XETRA', suffix: '.DE' },
  { country: 'France', countryCode: 'FR', exchange: 'Euronext Paris', suffix: '.PA' },
  { country: 'Hong Kong', countryCode: 'HK', exchange: 'HKEX', suffix: '.HK' },
  { country: 'Singapore', countryCode: 'SG', exchange: 'SGX', suffix: '.SI' },
  { country: 'Australia', countryCode: 'AU', exchange: 'ASX', suffix: '.AX' },
  { country: 'Canada', countryCode: 'CA', exchange: 'TSX', suffix: '.TO' },
];

export function normalizeMarketSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .toUpperCase();
}

export function defaultSymbolsForCategory(category) {
  const presets = MARKET_PRESETS[category] || MARKET_PRESETS[MARKET_DEFAULT_CATEGORY];
  return presets.slice(0, MARKET_MAX_SYMBOLS).map((item) => item.symbol);
}

export function labelForMarketSymbol(symbol) {
  const normalized = normalizeMarketSymbol(symbol);
  for (const presets of Object.values(MARKET_PRESETS)) {
    const match = presets.find((item) => item.symbol === normalized);
    if (match) return match.label;
  }
  return normalized;
}
