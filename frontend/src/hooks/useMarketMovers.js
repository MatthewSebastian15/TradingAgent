import { useCallback, useEffect, useRef, useState } from 'react';
import { getMarketMovers } from '../api/market';
import { MARKET_MOVERS_LIMIT } from '../utils/marketDefaults';

const MOVERS_REFRESH_MS = 120 * 1000;
const MOVERS_CACHE_TTL_MS = 180 * 1000;
const DEFAULT_FILTERS = {
  country: 'United States',
  exchange: 'NASDAQ',
  limit: MARKET_MOVERS_LIMIT,
};

const moversCache = new Map();
const moversInflight = new Map();

function nowMs() {
  return Date.now();
}

function moversKey(filters) {
  return [filters.country, filters.exchange, filters.limit]
    .map((value) => String(value || '').trim().toUpperCase())
    .join('|');
}

function isFresh(entry) {
  return entry && nowMs() - entry.fetchedAt < MOVERS_CACHE_TTL_MS;
}

function hasMovers(payload) {
  return Boolean(payload?.gainers?.length || payload?.losers?.length);
}

async function loadMoversPayload(filters, { signal, force = false } = {}) {
  const key = moversKey(filters);
  const cached = moversCache.get(key);
  if (!force && isFresh(cached)) return cached.data;
  if (!force && moversInflight.has(key)) return moversInflight.get(key);

  const request = getMarketMovers(filters, { signal })
    .then((payload) => {
      moversCache.set(key, { data: payload, fetchedAt: nowMs() });
      return payload;
    })
    .finally(() => {
      moversInflight.delete(key);
    });

  moversInflight.set(key, request);
  return request;
}

export function clearMarketMoversClientCacheForTests() {
  moversCache.clear();
  moversInflight.clear();
}

export function useMarketMovers() {
  const [country, setCountry] = useState(DEFAULT_FILTERS.country);
  const [exchange, setExchange] = useState(DEFAULT_FILTERS.exchange);
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS, requestId: 0 });
  const cached = moversCache.get(moversKey(DEFAULT_FILTERS));
  const initialData = isFresh(cached) ? cached.data : { gainers: [], losers: [] };
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!hasMovers(initialData));
  const [error, setError] = useState('');
  const dataRef = useRef(initialData);

  const loadMovers = useCallback(async (filters, { signal, force = false } = {}) => {
    setLoading(!hasMovers(dataRef.current));
    setError('');

    try {
      const payload = await loadMoversPayload(filters, { signal, force });
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
  }, []);

  const refresh = useCallback(
    (nextFilters = {}) => {
      const nextCountry = String(nextFilters.country ?? country).trim();
      const nextExchange = String(nextFilters.exchange ?? exchange).trim();
      if (!nextCountry || !nextExchange) {
        setError('Country and exchange required.');
        return false;
      }

      setCountry(nextCountry);
      setExchange(nextExchange);
      setAppliedFilters({
        country: nextCountry,
        exchange: nextExchange,
        limit: MARKET_MOVERS_LIMIT,
        requestId: Date.now(),
      });
      return true;
    },
    [country, exchange]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadMovers(appliedFilters, { signal: controller.signal });
    const interval = window.setInterval(() => {
      loadMovers(appliedFilters);
    }, MOVERS_REFRESH_MS);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [appliedFilters, loadMovers]);

  return {
    country,
    setCountry,
    exchange,
    setExchange,
    limit: MARKET_MOVERS_LIMIT,
    data,
    loading,
    error,
    refresh,
  };
}
