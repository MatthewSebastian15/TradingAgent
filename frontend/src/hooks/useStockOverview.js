import { useEffect, useState } from 'react';

import { getStockOverview } from '../api/market';

const IDLE = { ticker: null, data: null, error: null };

export function useStockOverview(ticker) {
  // One settled result tagged with the ticker it belongs to; anything tagged for another
  // ticker is masked below, so nothing leaks for the render between a ticker change and
  // the reset effect.
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    setState(IDLE);
    if (!ticker) return undefined;

    const controller = new AbortController();

    getStockOverview(ticker, { signal: controller.signal })
      .then((result) => setState({ ticker, data: result, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState({ ticker, data: null, error: err.message || 'Failed to load stock overview.' });
      });

    return () => controller.abort();
  }, [ticker]);

  const settled = Boolean(ticker) && state.ticker === ticker;
  return {
    data: settled ? state.data : null,
    loading: Boolean(ticker) && !settled,
    error: settled ? state.error : null,
  };
}
