import { useEffect } from 'react';

import { getMarketSearchWarmup } from '@/api/market';
import { readRecentTickers } from '@/utils/recentTickers';
import { writeTickerSearchCache } from '@/utils/tickerSearchCache';

let hasWarmedTickerSearch = false;

export function useTickerSearchWarmup({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled || hasWarmedTickerSearch) return undefined;
    hasWarmedTickerSearch = true;

    const controller = new AbortController();
    readRecentTickers({ limit: 10 });

    getMarketSearchWarmup({ signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        writeTickerSearchCache('', data?.popular || [], {
          limit: 10,
          filters: { market: 'ALL', type: 'ALL' },
          meta: data?.meta || { source: 'local_universe' },
        });
      })
      .catch((error) => {
        if (error.name !== 'AbortError') hasWarmedTickerSearch = false;
      });

    return () => controller.abort();
  }, [enabled]);
}
