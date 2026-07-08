import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getMarketQuotes, getMarketSparklines } from '../api/market';
import { startVisiblePolling } from '../utils/visiblePolling';
import { normalizeWatchlistSymbol } from '../utils/watchlistFormatters';

const QUOTE_POLL_MS = 100 * 1000;
const TREND_CACHE_TTL_MS = 5 * 60 * 1000;
const trendCache = new Map();
const quoteCache = new Map();

function uniqueSymbols(symbols) {
  return Array.from(
    new Set((Array.isArray(symbols) ? symbols : []).map(normalizeWatchlistSymbol).filter(Boolean))
  );
}

function mapQuotes(quotes) {
  const nextMap = new Map();
  (Array.isArray(quotes) ? quotes : []).forEach((quote) => {
    const symbol = normalizeWatchlistSymbol(quote?.sym || quote?.symbol);
    if (!symbol) return;
    nextMap.set(symbol, { ...quote, sym: symbol });
    quoteCache.set(symbol, { ...quote, sym: symbol });
  });
  return nextMap;
}

function readCachedQuotes(symbols) {
  const nextMap = new Map();
  symbols.forEach((symbol) => {
    const quote = quoteCache.get(symbol);
    if (quote) nextMap.set(symbol, quote);
  });
  return nextMap;
}

function readCachedTrends(symbols) {
  const now = Date.now();
  const nextMap = new Map();
  symbols.forEach((symbol) => {
    const cached = trendCache.get(symbol);
    if (cached && now - cached.cachedAt <= TREND_CACHE_TTL_MS) nextMap.set(symbol, cached.values);
  });
  return nextMap;
}

export function useWatchlistQuotes(symbols) {
  const normalizedSymbols = useMemo(() => uniqueSymbols(symbols), [symbols]);
  const symbolKey = normalizedSymbols.join('|');
  const [quotesBySymbol, setQuotesBySymbol] = useState(() => readCachedQuotes(normalizedSymbols));
  const [trendsBySymbol, setTrendsBySymbol] = useState(() => readCachedTrends(normalizedSymbols));
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [error, setError] = useState('');
  const controllerRef = useRef(null);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();

    if (!normalizedSymbols.length) {
      setQuotesBySymbol(new Map());
      setTrendsBySymbol(new Map());
      setLoadingQuotes(false);
      setLoadingTrends(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setQuotesBySymbol(readCachedQuotes(normalizedSymbols));
    setTrendsBySymbol(readCachedTrends(normalizedSymbols));
    setError('');

    setLoadingQuotes(true);
    getMarketQuotes(normalizedSymbols, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setQuotesBySymbol(mapQuotes(data?.quotes));
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load watchlist quotes.');
        setQuotesBySymbol(readCachedQuotes(normalizedSymbols));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingQuotes(false);
      });

    const cachedTrends = readCachedTrends(normalizedSymbols);
    const missingTrendSymbols = normalizedSymbols.filter((symbol) => !cachedTrends.has(symbol));

    if (!missingTrendSymbols.length) {
      setTrendsBySymbol(cachedTrends);
      setLoadingTrends(false);
      return;
    }

    setLoadingTrends(true);
    getMarketSparklines(missingTrendSymbols, { range: '1M', signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        const now = Date.now();
        const nextMap = new Map(cachedTrends);
        Object.entries(data?.sparklines || {}).forEach(([symbol, values]) => {
          const normalizedSymbol = normalizeWatchlistSymbol(symbol);
          const normalizedValues = (Array.isArray(values) ? values : [])
            .map((value) => Number(value))
            .filter(Number.isFinite)
            .slice(-18);
          trendCache.set(normalizedSymbol, { cachedAt: now, values: normalizedValues });
          nextMap.set(normalizedSymbol, normalizedValues);
        });
        setTrendsBySymbol(nextMap);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load watchlist trends.');
        setTrendsBySymbol(cachedTrends);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTrends(false);
      });
  }, [normalizedSymbols]);

  useEffect(() => {
    refresh();
    const stopPolling = startVisiblePolling(refresh, QUOTE_POLL_MS);

    return () => {
      controllerRef.current?.abort();
      stopPolling();
    };
  }, [refresh, symbolKey]);

  return {
    quotesBySymbol,
    trendsBySymbol,
    loadingQuotes,
    loadingTrends,
    error,
    refresh,
  };
}
