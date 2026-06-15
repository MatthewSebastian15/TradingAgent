import { useCallback, useEffect, useState } from 'react';
import { getMarketMovers } from '../api/market';

const MOVERS_REFRESH_MS = 120 * 1000;
const DEFAULT_FILTERS = {
  country: 'United States',
  exchange: 'NASDAQ',
  limit: 5,
};

export function useMarketMovers() {
  const [country, setCountry] = useState(DEFAULT_FILTERS.country);
  const [exchange, setExchange] = useState(DEFAULT_FILTERS.exchange);
  const [limit, setLimit] = useState(DEFAULT_FILTERS.limit);
  const [appliedFilters, setAppliedFilters] = useState({ ...DEFAULT_FILTERS, requestId: 0 });
  const [data, setData] = useState({ gainers: [], losers: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMovers = useCallback(async (filters, { signal } = {}) => {
    setLoading(true);
    setError('');

    try {
      const payload = await getMarketMovers(filters, { signal });
      setData(payload);
    } catch (loadError) {
      if (loadError.name === 'AbortError') return;
      setError('Failed to load market data from yfinance.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    const nextCountry = country.trim();
    const nextExchange = exchange.trim();
    if (!nextCountry || !nextExchange) {
      setError('Country and exchange required.');
      return false;
    }
    setAppliedFilters({
      country: nextCountry,
      exchange: nextExchange,
      limit: Number(limit),
      requestId: Date.now(),
    });
    return true;
  }, [country, exchange, limit]);

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
    limit,
    setLimit,
    data,
    loading,
    error,
    refresh,
  };
}
