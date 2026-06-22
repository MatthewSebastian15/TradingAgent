import { TICKER_SEARCH_UNIVERSE } from '../data/tickerUniverse';

const MAX_PREFIX_LENGTH = 18;
const POPULAR_SYMBOLS = new Set([
  'AAPL',
  'MSFT',
  'NVDA',
  'TSLA',
  'BBCA.JK',
  'BBRI.JK',
  'SPY',
  'QQQ',
  'BTC-USD',
  'ETH-USD',
]);

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function compactText(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, '');
}

export function normalizeTickerSymbol(value) {
  return normalizeText(value);
}

export function normalizeTickerSearchResult(item) {
  const symbol = normalizeTickerSymbol(item?.symbol);
  const type = normalizeText(item?.type || item?.quoteType || item?.typeDisp || '');
  const market = normalizeText(item?.market || inferMarket(symbol, type));
  return {
    ...item,
    symbol,
    name: String(item?.name || item?.shortName || item?.longName || symbol || '')
      .trim()
      .replace(/\s+/g, ' '),
    exchange: normalizeText(item?.exchange || item?.exchDisp || ''),
    type,
    market,
    source: item?.source || 'remote_cache',
  };
}

export function tickerExchangeLabel(item) {
  const exchange = normalizeText(item?.exchange);
  const type = normalizeText(item?.type || item?.quoteType);
  const market = normalizeText(item?.market);
  const source = normalizeText(item?.source);

  if (exchange && type) return `${exchange} · ${type}`;
  return exchange || type || market || source || '-';
}

function inferMarket(symbol, type = '') {
  if (symbol.endsWith('.JK')) return 'ID';
  if (type === 'CRYPTO' || symbol.endsWith('-USD')) return 'CRYPTO';
  if (type === 'FX' || symbol.endsWith('=X')) return 'FX';
  return 'US';
}

function resultItem(item, index) {
  const normalizedItem = normalizeTickerSearchResult({
    ...item,
    source: item.source || 'local_universe',
  });
  const { symbol, name, exchange, type, market } = normalizedItem;
  const haystack = normalizeText(`${symbol} ${name} ${exchange} ${type} ${market}`);
  const compactSymbol = compactText(symbol);
  const compactHaystack = compactText(haystack);
  const tokens = Array.from(
    new Set(
      `${symbol} ${compactSymbol} ${name} ${exchange} ${type} ${market}`
        .split(/[^A-Z0-9^._=-]+/i)
        .map((part) => compactText(part))
        .filter(Boolean)
    )
  );

  return {
    item: normalizedItem,
    index,
    symbol,
    compactSymbol,
    haystack,
    compactHaystack,
    tokens,
  };
}

const INDEXED_TICKERS = TICKER_SEARCH_UNIVERSE.map(resultItem);

function buildPrefixIndex(items) {
  const prefixIndex = new Map();

  items.forEach((entry, index) => {
    entry.tokens.forEach((token) => {
      const maxLength = Math.min(MAX_PREFIX_LENGTH, token.length);
      for (let length = 1; length <= maxLength; length += 1) {
        const prefix = token.slice(0, length);
        if (!prefixIndex.has(prefix)) prefixIndex.set(prefix, new Set());
        prefixIndex.get(prefix).add(index);
      }
    });
  });

  return prefixIndex;
}

const PREFIX_INDEX = buildPrefixIndex(INDEXED_TICKERS);

function scoreTicker(entry, query, compactQuery) {
  if (entry.symbol === query) return { score: 0, matchedBy: 'exact_symbol' };
  if (entry.compactSymbol === compactQuery) return { score: 1, matchedBy: 'compact_exact_symbol' };
  if (entry.symbol.startsWith(query)) return { score: 3, matchedBy: 'symbol_prefix' };
  if (entry.compactSymbol.startsWith(compactQuery)) {
    return { score: 5, matchedBy: 'compact_symbol_prefix' };
  }
  if (entry.tokens.some((token) => token.startsWith(compactQuery))) {
    return { score: 6, matchedBy: 'token_prefix' };
  }
  if (entry.haystack.startsWith(query)) return { score: 7, matchedBy: 'haystack_prefix' };
  if (entry.haystack.includes(query)) return { score: 8, matchedBy: 'haystack_contains' };
  if (compactQuery === 'BB' && entry.item.market === 'ID' && entry.tokens.includes('BANK')) {
    return { score: 6, matchedBy: 'idx_bank_hint' };
  }
  if (entry.compactHaystack.includes(compactQuery)) {
    return { score: 9, matchedBy: 'compact_haystack_contains' };
  }
  return null;
}

function candidateEntries(query, compactQuery) {
  if (compactQuery === 'BB') return INDEXED_TICKERS;

  const candidateIndexes = new Set();
  const queryParts = normalizeText(query).split(' ').map(compactText).filter(Boolean);

  [compactQuery, ...queryParts].forEach((part) => {
    const matches = PREFIX_INDEX.get(part.slice(0, MAX_PREFIX_LENGTH));
    matches?.forEach((index) => candidateIndexes.add(index));
  });

  if (!candidateIndexes.size) return INDEXED_TICKERS;
  return Array.from(candidateIndexes, (index) => INDEXED_TICKERS[index]);
}

function passesFilters(entry, market, type) {
  const normalizedMarket = normalizeText(market || 'ALL');
  const normalizedType = normalizeText(type || 'ALL');
  return (
    (normalizedMarket === 'ALL' || entry.item.market === normalizedMarket) &&
    (normalizedType === 'ALL' || entry.item.type === normalizedType)
  );
}

function sortingBonus(entry, recentSymbols, compactQuery) {
  let bonus = 0;
  if (recentSymbols.includes(entry.symbol)) bonus -= 3;
  if (POPULAR_SYMBOLS.has(entry.symbol)) bonus -= 1;
  if (entry.item.market === 'ID' && compactQuery.length <= 4) bonus -= 0.5;
  return bonus;
}

export function searchLocalTickers(
  query,
  limit = 10,
  { market = 'ALL', type = 'ALL', recentSymbols = [] } = {}
) {
  const normalizedQuery = normalizeText(query);
  const compactQuery = compactText(normalizedQuery);
  if (!compactQuery) return [];

  const normalizedRecentSymbols = recentSymbols.map(normalizeTickerSymbol).filter(Boolean);
  const results = candidateEntries(normalizedQuery, compactQuery)
    .filter((entry) => passesFilters(entry, market, type))
    .map((entry) => {
      const rank = scoreTicker(entry, normalizedQuery, compactQuery);
      if (rank === null) return null;
      return {
        entry,
        score: rank.score + sortingBonus(entry, normalizedRecentSymbols, compactQuery),
        matchedBy: rank.matchedBy,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score || left.entry.index - right.entry.index)
    .slice(0, limit)
    .map(({ entry, score, matchedBy }) => ({
      ...entry.item,
      rank: score,
      matched_by: matchedBy,
    }));

  if (
    results.length ||
    compactQuery.length < 2 ||
    !/^[A-Z0-9^][A-Z0-9^._=-]{1,24}$/.test(normalizedQuery)
  ) {
    return results;
  }

  return [
    {
      symbol: normalizedQuery,
      name: normalizedQuery,
      exchange: '',
      type: 'SYMBOL',
      market: normalizedQuery.endsWith('.JK') ? 'ID' : 'US',
      source: 'manual_symbol',
      rank: 99,
      matched_by: 'manual_symbol',
    },
  ];
}

export function getPopularLocalTickers(limit = 10) {
  const popular = INDEXED_TICKERS.filter((entry) => POPULAR_SYMBOLS.has(entry.symbol)).map(
    (entry) => ({ ...entry.item, source: 'popular' })
  );
  return popular.slice(0, limit);
}

export function mergeTickerResults(...groups) {
  const merged = [];
  const seen = new Set();

  groups.flat().forEach((item) => {
    const normalized = normalizeTickerSearchResult(item);
    if (!normalized.symbol || seen.has(normalized.symbol)) return;
    seen.add(normalized.symbol);
    merged.push(normalized);
  });

  return merged;
}
