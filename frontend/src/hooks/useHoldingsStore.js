import { useCallback, useRef, useState } from 'react';

import { useStoredList } from './useStoredList';
import {
  addHolding,
  clearHoldings,
  HOLDINGS_STORAGE_KEY,
  readHoldingsDetailed,
  removeHolding,
  updateHolding,
} from '../services/holdingsStore';

const store = {
  key: HOLDINGS_STORAGE_KEY,
  readDetailed: readHoldingsDetailed,
  clear: clearHoldings,
};

export function useHoldingsStore() {
  const { items, hydrated, storageStatus, refresh, run, dismissStorageError } =
    useStoredList(store);

  const [pending, setPending] = useState(false);
  const addingRef = useRef(false);

  const add = useCallback(
    async (record) => {
      if (addingRef.current) return { ok: false, reason: 'busy' }; // a double click can never add twice
      addingRef.current = true;
      setPending(true);
      try {
        return await run(() => addHolding(record));
      } finally {
        addingRef.current = false;
        setPending(false);
      }
    },
    [run]
  );
  const update = useCallback((id, patch) => run(() => updateHolding(id, patch)), [run]);
  const remove = useCallback((id) => run(() => removeHolding(id)), [run]);
  const resetUnreadable = useCallback(() => run(clearHoldings), [run]);

  return {
    holdings: items,
    hydrated,
    storageStatus,
    pending,
    add,
    update,
    remove,
    resetUnreadable,
    retryRead: refresh,
    dismissStorageError,
  };
}
