import { useCallback, useEffect, useRef, useState } from 'react';

import { getStockOverview } from '../api/market';

const IDLE = { ticker: null, data: null, error: null };

export function useStockOverview(ticker) {
  // One settled result tagged with the ticker it belongs to; anything tagged for another
  // ticker is masked below, so nothing leaks for the render between a ticker change and
  // the reset effect.
  const [state, setState] = useState(IDLE);
  // retry() bypasses the server cache for exactly one fetch; a plain ticker change does not.
  const [retryCount, setRetryCount] = useState(0);
  const forceNext = useRef(false);
  const retry = useCallback(() => {
    forceNext.current = true;
    setRetryCount((n) => n + 1);
  }, []);

  useEffect(() => {
    setState(IDLE);
    if (!ticker) return undefined;

    const controller = new AbortController();
    const options = { signal: controller.signal };
    if (forceNext.current) {
      options.forceRefresh = true;
      forceNext.current = false;
    }

    getStockOverview(ticker, options)
      .then((result) => {
        if (controller.signal.aborted) return;
        setState({ ticker, data: result, error: null });
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setState({ ticker, data: null, error: err.message || 'Failed to load stock overview.' });
      });

    return () => controller.abort();
  }, [ticker, retryCount]);

  const settled = Boolean(ticker) && state.ticker === ticker;
  return {
    data: settled ? state.data : null,
    loading: Boolean(ticker) && !settled,
    error: settled ? state.error : null,
    retry,
  };
}
