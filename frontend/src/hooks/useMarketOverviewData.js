import { useCallback, useEffect, useRef, useState } from 'react';

import { getMarketOverview } from '../api/market';

const OVERVIEW_REFRESH_MS = 60 * 1000;
const OVERVIEW_CACHE_TTL_MS = 120 * 1000;
const overviewCache = new Map();
const overviewInflight = new Map();

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

function isFresh(entry) {
  return entry && nowMs() - entry.fetchedAt < OVERVIEW_CACHE_TTL_MS;
}

function hasItems(payload) {
  return Array.isArray(payload?.items) && payload.items.length > 0;
}

async function loadOverviewPayload(symbols, { signal, force = false } = {}) {
  const key = overviewKey(symbols);
  const cached = overviewCache.get(key);
  if (!force && isFresh(cached)) return cached.data;
  if (!force && overviewInflight.has(key)) return overviewInflight.get(key);

  const request = getMarketOverview(symbols, { signal })
    .then((payload) => {
      overviewCache.set(key, { data: payload, fetchedAt: nowMs() });
      return payload;
    })
    .finally(() => {
      overviewInflight.delete(key);
    });

  overviewInflight.set(key, request);
  return request;
}

export function clearMarketOverviewClientCacheForTests() {
  overviewCache.clear();
  overviewInflight.clear();
}

export function useMarketOverviewData(symbols) {
  const cacheKey = overviewKey(symbols);
  const cached = overviewCache.get(cacheKey);
  const initialData = isFresh(cached) ? cached.data : { items: [] };
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!hasItems(initialData));
  const [error, setError] = useState('');
  const dataRef = useRef(initialData);

  const loadOverview = useCallback(
    async ({ signal, force = false } = {}) => {
      if (!symbols.length) return null;
      setLoading(!hasItems(dataRef.current));
      setError('');

      try {
        const payload = await loadOverviewPayload(symbols, { signal, force });
        if (signal?.aborted) return null;
        dataRef.current = payload;
        setData(payload);
        setError('');
        return payload;
      } catch (loadError) {
        if (loadError.name === 'AbortError') return null;
        setError('Failed to load market data from yfinance.');
        return null;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [symbols]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadOverview({ signal: controller.signal });
    const interval = window.setInterval(() => {
      loadOverview();
    }, OVERVIEW_REFRESH_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadOverview]);

  return {
    data,
    loading,
    error,
    refresh: () => loadOverview({ force: true }),
  };
}
