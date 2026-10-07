import { useEffect, useState } from 'react';

import { getQuoteLite } from '../api/market';
import { startVisiblePolling } from '../utils/visiblePolling';

const POLL_INTERVAL_MS = 10_000;
const IDLE = { ticker: null, quote: null, updatedAt: null };

// Polls the fast quote endpoint for one ticker while the tab is visible. A failed poll or
// an error payload keeps the last good quote (and its updatedAt) instead of clearing it.
export function useQuoteLite(ticker) {
  // Tagged with its ticker so a quote for a previous ticker is masked in the very render
  // where the ticker changes, before the reset effect runs.
  const [state, setState] = useState(IDLE);

  useEffect(() => {
    setState(IDLE);
    if (!ticker) return undefined;

    const controller = new AbortController();

    const poll = async () => {
      try {
        const quote = await getQuoteLite(ticker, { signal: controller.signal });
        if (controller.signal.aborted || quote?.error || quote?.price == null) return;
        setState({ ticker, quote, updatedAt: Date.now() });
      } catch {
        // transient failure: keep showing the last known quote
      }
    };

    poll();
    const stopPolling = startVisiblePolling(poll, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      stopPolling();
    };
  }, [ticker]);

  const live = Boolean(ticker) && state.ticker === ticker;
  return { quote: live ? state.quote : null, updatedAt: live ? state.updatedAt : null };
}
