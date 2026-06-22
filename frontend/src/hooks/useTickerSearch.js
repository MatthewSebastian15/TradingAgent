import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { searchMarketTickers } from '@/api/market';
import { readRecentTickers, saveRecentTicker } from '@/utils/recentTickers';
import {
  getPopularLocalTickers,
  mergeTickerResults,
  normalizeTickerSearchResult,
  searchLocalTickers,
} from '@/utils/tickerSearch';
import { readTickerSearchCache, writeTickerSearchCache } from '@/utils/tickerSearchCache';

function normalizeSearchResponse(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function normalizeQuery(value) {
  return String(value || '').trim();
}

export function useTickerSearch({
  query,
  enabled = true,
  limit = 10,
  remoteMinLength = 2,
  remoteDebounceMs = 150,
  market = 'ALL',
  type = 'ALL',
  searchTickers = null,
} = {}) {
  const [results, setResults] = useState([]);
  const [recentResults, setRecentResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const requestSeqRef = useRef(0);
  const resultsRef = useRef([]);

  const trimmedQuery = useMemo(() => normalizeQuery(query), [query]);
  const filters = useMemo(() => ({ market, type }), [market, type]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    if (!enabled) {
      requestSeqRef.current += 1;
      setResults([]);
      setRecentResults([]);
      setLoading(false);
      setRefreshing(false);
      setError('');
      setActiveIndex(-1);
      return;
    }

    if (!trimmedQuery) {
      requestSeqRef.current += 1;
      const recent = readRecentTickers({ limit });
      const cachedPopular = readTickerSearchCache('', { limit, filters })?.results || [];
      const popular = cachedPopular.length ? cachedPopular : getPopularLocalTickers(limit);
      const nextRecent = recent.length ? recent : popular;
      setResults([]);
      setRecentResults(nextRecent);
      setLoading(false);
      setRefreshing(false);
      setError('');
      setMeta({
        query: '',
        limit,
        source: recent.length ? 'recent' : 'popular',
        remote_refresh_queued: false,
      });
      setActiveIndex(nextRecent.length ? 0 : -1);
      return;
    }

    const recentSymbols = readRecentTickers({ limit: 20 }).map((item) => item.symbol);
    const localResults = searchLocalTickers(trimmedQuery, limit, {
      market,
      type,
      recentSymbols,
    });
    const cachedPayload = readTickerSearchCache(trimmedQuery, { limit, filters });
    const cachedResults = cachedPayload?.results || [];
    const nextResults = mergeTickerResults(localResults, cachedResults).slice(0, limit);

    setRecentResults([]);
    setResults(nextResults);
    setLoading(nextResults.length === 0 && trimmedQuery.length >= remoteMinLength);
    setRefreshing(false);
    setError('');
    setMeta(
      cachedPayload?.meta || {
        query: trimmedQuery,
        limit,
        source: cachedResults.length ? 'cache' : 'local_universe',
        remote_refresh_queued: trimmedQuery.length >= remoteMinLength,
      }
    );
    setActiveIndex(nextResults.length ? 0 : -1);
  }, [enabled, filters, limit, market, remoteMinLength, trimmedQuery, type]);

  useEffect(() => {
    if (!enabled || trimmedQuery.length < remoteMinLength) return undefined;

    const controller = new AbortController();
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    const timerId = window.setTimeout(async () => {
      try {
        setRefreshing(true);
        setLoading((current) => current || resultsRef.current.length === 0);
        const data = searchTickers
          ? await searchTickers({
              query: trimmedQuery,
              limit,
              market,
              type,
              signal: controller.signal,
            })
          : await searchMarketTickers(trimmedQuery, {
              limit,
              market,
              type,
              signal: controller.signal,
            });

        if (controller.signal.aborted || requestSeqRef.current !== requestId) return;

        const remoteResults = normalizeSearchResponse(data).map((item) =>
          normalizeTickerSearchResult(item)
        );
        writeTickerSearchCache(trimmedQuery, remoteResults, {
          limit,
          filters,
          meta: data?.meta || { source: 'remote_cache' },
        });

        const recentSymbols = readRecentTickers({ limit: 20 }).map((item) => item.symbol);
        const localResults = searchLocalTickers(trimmedQuery, limit, {
          market,
          type,
          recentSymbols,
        });
        const nextResults = mergeTickerResults(localResults, remoteResults).slice(0, limit);
        setResults(nextResults);
        setActiveIndex(nextResults.length ? 0 : -1);
        setError('');
        setMeta(data?.meta || { query: trimmedQuery, limit, source: 'remote_cache' });
      } catch (err) {
        if (err.name === 'AbortError' || requestSeqRef.current !== requestId) return;
        setError(
          resultsRef.current.length ? '' : 'Ticker search failed. Showing local matches only.'
        );
      } finally {
        if (!controller.signal.aborted && requestSeqRef.current === requestId) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }, remoteDebounceMs);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [
    enabled,
    filters,
    limit,
    market,
    remoteDebounceMs,
    remoteMinLength,
    searchTickers,
    trimmedQuery,
    type,
  ]);

  const selectTicker = useCallback((item) => {
    const normalized = normalizeTickerSearchResult(item);
    saveRecentTicker(normalized);
    return normalized;
  }, []);

  const clearError = useCallback(() => setError(''), []);

  return {
    results,
    recentResults,
    loading,
    refreshing,
    error,
    meta,
    activeIndex,
    setActiveIndex,
    open,
    setOpen,
    selectTicker,
    clearError,
  };
}
