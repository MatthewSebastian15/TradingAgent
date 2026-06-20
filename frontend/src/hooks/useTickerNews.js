import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchTickerNews } from '@/services/tickerNewsApi';

const MEMORY_CACHE = new Map();
const SESSION_TTL_MS = 10 * 60 * 1000;
const STALE_TTL_MS = 60 * 60 * 1000;

function nowMs() {
  return Date.now();
}

function storageKey({ ticker, windowDays, limit }) {
  return `tradingagents:ticker-news:v1:${ticker}:${windowDays}:${limit}`;
}

function readSessionEntry(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSessionEntry(key, entry) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Memory cache is enough when storage is unavailable.
  }
}

function readCache(key, maxAgeMs = STALE_TTL_MS) {
  const memory = MEMORY_CACHE.get(key);
  if (memory && nowMs() - memory.fetchedAt <= maxAgeMs) return memory;

  const stored = readSessionEntry(key);
  if (stored && nowMs() - Number(stored.fetchedAt || 0) <= maxAgeMs) return stored;

  return null;
}

function writeCache(key, data) {
  const entry = { data, fetchedAt: nowMs() };
  MEMORY_CACHE.set(key, entry);
  writeSessionEntry(key, entry);
  return entry;
}


export function clearTickerNewsClientStateForTests() {
  MEMORY_CACHE.clear();
  if (typeof window === 'undefined') return;
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith('tradingagents:ticker-news:v1:')) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Test cleanup best effort only.
  }
}

function normalizeStatus({ cached, loading, refreshing, error }) {
  if (loading) return cached ? 'stale' : 'loading';
  if (refreshing) return 'refreshing';
  if (error) return cached ? 'stale' : 'error';
  return 'success';
}

export function useTickerNews({ ticker, windowDays = 30, limit = 30, provider, enabled = true } = {}) {
  const key = useMemo(() => storageKey({ ticker: ticker || '', windowDays, limit }), [ticker, windowDays, limit]);
  const initialCache = useMemo(() => readCache(key), [key]);
  const [data, setData] = useState(initialCache?.data || null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled && Boolean(ticker) && !initialCache?.data);
  const [refreshing, setRefreshing] = useState(false);
  const controllerRef = useRef(null);

  const load = useCallback(
    async ({ force = false, silent = false } = {}) => {
      if (!enabled || !ticker) return null;

      const fresh = !force ? readCache(key, SESSION_TTL_MS) : null;
      if (fresh?.data) {
        setData(fresh.data);
        setError(null);
        setLoading(false);
        return fresh.data;
      }

      const cached = readCache(key, STALE_TTL_MS);
      if (cached?.data && !force) setData(cached.data);

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);
      if (silent || cached?.data) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await fetchTickerNews({
          ticker,
          windowDays,
          limit,
          provider,
          forceRefresh: force,
          signal: controller.signal,
        });
        writeCache(key, result);
        setData(result);
        setError(null);
        return result;
      } catch (err) {
        if (err?.name !== 'AbortError') setError(err);
        if (cached?.data) return cached.data;
        throw err;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, key, limit, provider, ticker, windowDays]
  );

  useEffect(() => {
    load({ silent: Boolean(initialCache?.data) }).catch(() => {});
    return () => controllerRef.current?.abort();
  }, [load, initialCache?.data]);

  const reload = useCallback(({ force = false } = {}) => load({ force, silent: Boolean(data) }), [data, load]);

  return {
    data,
    articles: data?.articles || [],
    decisionCompanyNews: data?.decision_company_news || [],
    marketContextNews: data?.market_context_news || [],
    promptArticles: data?.prompt_articles || [],
    providerStatus: data?.provider_status || {},
    strictNewsFilter: data?.strict_news_filter || {},
    cache: data?.cache || {},
    status: normalizeStatus({ cached: Boolean(data), loading, refreshing, error }),
    error,
    reload,
  };
}
