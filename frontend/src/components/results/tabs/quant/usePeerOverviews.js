import { useEffect, useState } from 'react';

import { getStockOverview } from '../../../../api/market';

export function usePeerOverviews(symbols) {
  const key = symbols.join(',');
  const [state, setState] = useState({ key: '', data: [] });
  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    let alive = true;
    Promise.allSettled(
      key.split(',').map((s) => getStockOverview(s, { signal: controller.signal }))
    ).then((results) => {
      if (!alive) return;
      setState({
        key,
        data: results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value),
      });
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [key]);
  return key && state.key === key ? state.data : [];
}
