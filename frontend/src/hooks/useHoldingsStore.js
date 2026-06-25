import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { addHolding, readHoldings, removeHolding } from '../services/holdingsStore';

export function useHoldingsStore() {
  const [holdings, setHoldings] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const list = await readHoldings();
    if (!aliveRef.current) return;
    setHoldings(list);
    setHydrated(true);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  const add = useCallback(
    async (record) => {
      await addHolding(record);
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id) => {
      await removeHolding(id);
      await refresh();
    },
    [refresh]
  );

  const ids = useMemo(() => new Set(holdings.map((entry) => entry.id)), [holdings]);

  return { holdings, ids, hydrated, add, remove };
}
