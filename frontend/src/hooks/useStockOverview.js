import { useEffect, useState } from 'react';

import { getStockOverview } from '../api/market';

export function useStockOverview(ticker) {
  const [data, setData] = useState(null);
  const [loadedFor, setLoadedFor] = useState(null); // ticker `data` belongs to
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
        setLoadedFor(ticker);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Failed to load stock overview.');
        setLoading(false);
      });

    return () => controller.abort();
  }, [ticker]);

  // Between a ticker change and the reset effect, `data` is still the previous ticker's.
  return { data: loadedFor === ticker ? data : null, loading, error };
}
