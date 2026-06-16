import { TICKER_SEARCH_UNIVERSE } from '../data/tickerUniverse';

const MAX_PREFIX_LENGTH = 18;

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function compactText(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, '');
}

function resultItem(item, index) {
  const symbol = normalizeText(item.symbol);
  const name = String(item.name || symbol).trim();
  const exchange = String(item.exchange || '')
    .trim()
    .toUpperCase();
  const type = String(item.type || item.quoteType || '')
    .trim()
    .toUpperCase();
  const market = String(item.market || '')
    .trim()
    .toUpperCase();
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
    item: {
      ...item,
      symbol,
      name,
      exchange,
      type,
      market,
      source: item.source || 'local_universe',
    },
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
  if (entry.symbol === query || entry.compactSymbol === compactQuery) return 0;
  if (entry.symbol.startsWith(query)) return 1;
  if (entry.compactSymbol.startsWith(compactQuery)) return 2;
  if (entry.tokens.some((token) => token.startsWith(compactQuery))) return 3;
  if (entry.haystack.startsWith(query)) return 4;
  if (entry.haystack.includes(query)) return 8;
  if (entry.compactHaystack.includes(compactQuery)) return 9;
  return null;
}

function candidateEntries(query, compactQuery) {
  const candidateIndexes = new Set();
  const queryParts = normalizeText(query).split(' ').map(compactText).filter(Boolean);

  [compactQuery, ...queryParts].forEach((part) => {
    const matches = PREFIX_INDEX.get(part.slice(0, MAX_PREFIX_LENGTH));
    matches?.forEach((index) => candidateIndexes.add(index));
  });

  if (!candidateIndexes.size) return INDEXED_TICKERS;
  return Array.from(candidateIndexes, (index) => INDEXED_TICKERS[index]);
}

export function searchLocalTickers(query, limit = 10) {
  const normalizedQuery = normalizeText(query);
  const compactQuery = compactText(normalizedQuery);
  if (!compactQuery) return [];

  const results = candidateEntries(normalizedQuery, compactQuery)
    .map((entry) => {
      const score = scoreTicker(entry, normalizedQuery, compactQuery);
      return score === null ? null : { entry, score };
    })
    .filter(Boolean)
    .sort((left, right) => left.score - right.score || left.entry.index - right.entry.index)
    .slice(0, limit)
    .map(({ entry }) => ({ ...entry.item }));

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
    },
  ];
}

export function mergeTickerResults(...groups) {
  const merged = [];
  const seen = new Set();

  groups.flat().forEach((item) => {
    const symbol = normalizeText(item?.symbol);
    if (!symbol || seen.has(symbol)) return;
    seen.add(symbol);
    merged.push({
      ...item,
      symbol,
      name: String(item.name || item.shortName || item.longName || symbol).trim(),
      exchange: String(item.exchange || item.exchDisp || '')
        .trim()
        .toUpperCase(),
      type: String(item.type || item.quoteType || item.typeDisp || '')
        .trim()
        .toUpperCase(),
      source: item.source || 'remote_cache',
    });
  });

  return merged;
}
