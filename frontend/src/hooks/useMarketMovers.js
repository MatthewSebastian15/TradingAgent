import { useCallback, useEffect, useState } from 'react';
import { getMarketMovers } from '../api/market';
import { MARKET_MOVERS_LIMIT } from '../utils/marketDefaults';

const MOVERS_REFRESH_MS = 120 * 1000;
const DEFAULT_FILTERS = {
  country: 'United States',
  exchange: 'NASDAQ',
  limit: MARKET_MOVERS_LIMIT,
};

export function useMarketMovers() {
  const [country, setCountry] = useState(DEFAULT_FILTERS.country);
  const [exchange, setExchange] = useState(DEFAULT_FILTERS.exchange);
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
