import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getMarketQuotes, getMarketSparklines } from '../api/market';
import { fetchInBatches } from '../utils/marketBatch';
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

function mergeQuotes(previous, quotes) {
  const next = new Map(previous);
  (Array.isArray(quotes) ? quotes : []).forEach((quote) => {
    const symbol = normalizeWatchlistSymbol(quote?.sym || quote?.symbol);
    if (!symbol) return;
    const normalized = { ...quote, sym: symbol };
    next.set(symbol, normalized);
    quoteCache.set(symbol, normalized);
  });
  return next;
}

function normalizeSparkline(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .slice(-18);
}

function describeFailures(failed, total, label) {
  if (!failed.length) return '';
  const count = failed.reduce((sum, item) => sum + item.symbols.length, 0);
  if (count >= total) return failed[0].error?.message || `Failed to load watchlist ${label}.`;
  return `${label[0].toUpperCase()}${label.slice(1)} unavailable for ${count} of ${total} symbols.`;
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

export function useWatchlistQuotes(symbols, { trends = true } = {}) {
  const normalizedSymbols = useMemo(() => uniqueSymbols(symbols), [symbols]);
  const symbolKey = normalizedSymbols.join('|');
  const [quotesBySymbol, setQuotesBySymbol] = useState(() => readCachedQuotes(normalizedSymbols));
  const [trendsBySymbol, setTrendsBySymbol] = useState(() =>
    trends ? readCachedTrends(normalizedSymbols) : new Map()
  );
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [error, setError] = useState('');
  const [failedSymbols, setFailedSymbols] = useState(() => new Set());
  const controllerRef = useRef(null);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();

    if (!normalizedSymbols.length) {
      setQuotesBySymbol(new Map());
      setTrendsBySymbol(new Map());
      setFailedSymbols(new Set());
      setLoadingQuotes(false);
      setLoadingTrends(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;

    const cachedTrends = trends ? readCachedTrends(normalizedSymbols) : new Map();
    setQuotesBySymbol(readCachedQuotes(normalizedSymbols));
    setTrendsBySymbol(cachedTrends);
    setFailedSymbols(new Set());
    setError('');

    const loadQuotes = async () => {
      setLoadingQuotes(true);
      try {
        const { failed } = await fetchInBatches(
          normalizedSymbols,
          (batch) => getMarketQuotes(batch, { signal }),
          {
            onBatch: (data) => {
              if (!signal.aborted) setQuotesBySymbol((prev) => mergeQuotes(prev, data?.quotes));
            },
          }
        );
        if (signal.aborted || !failed.length) return;
        setFailedSymbols(new Set(failed.flatMap((item) => item.symbols)));
        setError((prev) => prev || describeFailures(failed, normalizedSymbols.length, 'quotes'));
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load watchlist quotes.');
      } finally {
        if (!signal.aborted) setLoadingQuotes(false);
      }
    };

    const missingTrendSymbols = trends
      ? normalizedSymbols.filter((symbol) => !cachedTrends.has(symbol))
      : [];
    const loadTrends = async () => {
      if (!missingTrendSymbols.length) {
        setLoadingTrends(false);
        return;
      }
      setLoadingTrends(true);
      try {
        const { failed } = await fetchInBatches(
          missingTrendSymbols,
          (batch) => getMarketSparklines(batch, { range: '1M', signal }),
          {
            onBatch: (data) => {
              if (signal.aborted) return;
              const now = Date.now();
              setTrendsBySymbol((prev) => {
                const next = new Map(prev);
                Object.entries(data?.sparklines || {}).forEach(([symbol, values]) => {
                  const key = normalizeWatchlistSymbol(symbol);
                  const normalized = normalizeSparkline(values);
                  trendCache.set(key, { cachedAt: now, values: normalized });
                  next.set(key, normalized);
                });
                return next;
              });
            },
          }
        );
        if (signal.aborted || !failed.length) return;
        setError((prev) => prev || describeFailures(failed, missingTrendSymbols.length, 'trends'));
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Failed to load watchlist trends.');
      } finally {
        if (!signal.aborted) setLoadingTrends(false);
      }
    };

    await Promise.all([loadQuotes(), loadTrends()]);
  }, [normalizedSymbols, trends]);

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
    failedSymbols,
    refresh,
  };
}
