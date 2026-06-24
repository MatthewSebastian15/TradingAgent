import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { addTracked, readTracked, removeTracked } from '../services/portfolioStore';

export function usePortfolioStore() {
  const [tracked, setTracked] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const list = await readTracked();
    if (!aliveRef.current) return;
    setTracked(list);
    setHydrated(true);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  const track = useCallback(
    async (record) => {
      await addTracked(record);
      await refresh();
    },
    [refresh]
  );

  const untrack = useCallback(
    async (id) => {
      await removeTracked(id);
      await refresh();
    },
    [refresh]
  );

  const trackedIds = useMemo(() => new Set(tracked.map((entry) => entry.id)), [tracked]);

  return { tracked, trackedIds, hydrated, track, untrack };
}
