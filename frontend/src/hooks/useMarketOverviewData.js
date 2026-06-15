import { useCallback, useEffect, useState } from 'react';
import { getMarketOverview } from '../api/market';

const OVERVIEW_REFRESH_MS = 60 * 1000;

export function useMarketOverviewData(symbols) {
  const [data, setData] = useState({ items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(
    async ({ signal } = {}) => {
      if (!symbols.length) return;
      setLoading(true);
      setError('');

      try {
        const payload = await getMarketOverview(symbols, { signal });
        setData(payload);
      } catch (loadError) {
        if (loadError.name === 'AbortError') return;
        setError('Failed to load market data from yfinance.');
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
    refresh: () => loadOverview(),
  };
}
