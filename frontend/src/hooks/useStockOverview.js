import { useEffect, useState } from 'react';

import { getStockOverview } from '../api/market';

export function useStockOverview(ticker) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ticker) {
      setData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError(null);

    getStockOverview(ticker, { signal: controller.signal })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load stock overview.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [ticker]);

  return { data, loading, error };
}
