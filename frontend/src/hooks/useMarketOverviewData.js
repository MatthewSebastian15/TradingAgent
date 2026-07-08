// ponytail: sessionStorage cache of public market data; dies on tab close. Intentionally not encrypted.
import { useCallback, useEffect, useRef, useState } from 'react';

import { getMarketOverview } from '../api/market';
import { startVisiblePolling } from '../utils/visiblePolling';

const OVERVIEW_REFRESH_MS = 60 * 1000;
const OVERVIEW_CACHE_TTL_MS = 120 * 1000;
const OVERVIEW_STORAGE_PREFIX = 'tradingagents:market-overview:v1:';
const overviewCache = new Map();
const overviewInflight = new Map();
let forceOverviewRequestSequence = 0;

function nowMs() {
  return Date.now();
}

function overviewKey(symbols) {
  return symbols
    .map((symbol) =>
      String(symbol || '')
        .trim()
        .toUpperCase()
    )
    .join('|');
}

function storageKey(key) {
  return `${OVERVIEW_STORAGE_PREFIX}${key}`;
}

function isFresh(entry) {
  return entry && nowMs() - entry.fetchedAt < OVERVIEW_CACHE_TTL_MS;
}

function hasItems(payload) {
  return Array.isArray(payload?.items) && payload.items.length > 0;
}

function readStoredOverviewCache(key) {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey(key)) || 'null');
    if (!parsed || !parsed.data || !isFresh(parsed)) return null;
    overviewCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredOverviewCache(key, entry) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Browser storage can fail. Memory cache still keeps the current session fast.
  }
}

function readAnyFreshOverviewCache(key) {
  const memoryEntry = overviewCache.get(key);
  if (isFresh(memoryEntry)) return memoryEntry;

  return readStoredOverviewCache(key);
}

function clearStoredOverviewCaches() {
  if (typeof window === 'undefined') return;

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(OVERVIEW_STORAGE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore test/browser storage cleanup failures.
  }
}

function cachedOverviewData(symbols) {
  const cached = readAnyFreshOverviewCache(overviewKey(symbols));
  return cached?.data || { items: [] };
}

async function loadOverviewPayload(symbols, { signal, force = false } = {}) {
  const key = overviewKey(symbols);
  const cached = readAnyFreshOverviewCache(key);
  if (!force && isFresh(cached)) return cached.data;
  if (!force && overviewInflight.has(key)) return overviewInflight.get(key);

  const requestKey = force ? `${key}:force:${nowMs()}:${(forceOverviewRequestSequence += 1)}` : key;
  const request = getMarketOverview(symbols, { signal, forceRefresh: force })
    .then((payload) => {
      const entry = { data: payload, fetchedAt: nowMs() };
      overviewCache.set(key, entry);
      writeStoredOverviewCache(key, entry);
      return payload;
    })
    .finally(() => {
      overviewInflight.delete(requestKey);
    });

  overviewInflight.set(requestKey, request);
  return request;
}

export function prefetchMarketOverviewData(symbols, options = {}) {
  return loadOverviewPayload(symbols, options).catch(() => null);
}

export function clearMarketOverviewClientCacheForTests() {
  overviewCache.clear();
  overviewInflight.clear();
  forceOverviewRequestSequence = 0;
  clearStoredOverviewCaches();
}

export function seedMarketOverviewClientCacheForTests(symbols, data) {
  const key = overviewKey(symbols);
  const entry = { data, fetchedAt: nowMs() };
  overviewCache.set(key, entry);
  writeStoredOverviewCache(key, entry);
}

export function useMarketOverviewData(symbols) {
  const initialCache = cachedOverviewData(symbols);
  const [data, setData] = useState(initialCache);
  const [status, setStatus] = useState(hasItems(initialCache) ? 'success' : 'idle');
  const [error, setError] = useState('');
  const dataRef = useRef(initialCache);
  const requestIdRef = useRef(0);

  const loadOverview = useCallback(
    async ({ signal, force = false, silent = false } = {}) => {
      if (!symbols.length) return null;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!silent) {
        setStatus(hasItems(dataRef.current) ? 'refreshing' : 'loading');
      }
      setError('');

      try {
        const payload = await loadOverviewPayload(symbols, { signal, force });
        if (signal?.aborted || requestIdRef.current !== requestId) return payload;
        dataRef.current = payload;
        setData(payload);
        setError('');
        setStatus('success');
        return payload;
      } catch (loadError) {
        if (loadError.name === 'AbortError') return null;
        if (requestIdRef.current !== requestId) return null;
        setError('Failed to load market data from yfinance.');
        setStatus(hasItems(dataRef.current) ? 'stale' : 'error');
        return null;
      }
    },
    [symbols]
  );

  useEffect(() => {
    const cached = cachedOverviewData(symbols);
    if (hasItems(cached)) {
      dataRef.current = cached;
      setData(cached);
      setStatus('success');
    } else {
      dataRef.current = { items: [] };
      setData({ items: [] });
      setStatus('idle');
    }

    const controller = new AbortController();
    loadOverview({ signal: controller.signal, force: false, silent: hasItems(cached) }).catch(
      () => {}
    );
    const stopPolling = startVisiblePolling(() => {
      // ponytail: force:false lets the backend TTL cache absorb auto-refresh.
      // force:true here re-fetched yfinance cold every 60s, ignoring both caches.
      // Manual refresh (refresh()) still forces a fresh fetch.
      loadOverview({ force: false, silent: true }).catch(() => {});
    }, OVERVIEW_REFRESH_MS);

    return () => {
      controller.abort();
      stopPolling();
    };
  }, [loadOverview, symbols]);

  return {
    data,
    status,
    loading: status === 'loading' || status === 'refreshing',
    error,
    refresh: () => loadOverview({ force: true, silent: false }),
  };
}
