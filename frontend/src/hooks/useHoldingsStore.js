import { useCallback } from 'react';

import { useStoredList } from './useStoredList';
import {
  addHolding,
  clearHoldings,
  HOLDINGS_STORAGE_KEY,
  readHoldingsDetailed,
  removeHolding,
} from '../services/holdingsStore';

const store = {
  key: HOLDINGS_STORAGE_KEY,
  readDetailed: readHoldingsDetailed,
  clear: clearHoldings,
};

export function useHoldingsStore() {
  const { items, hydrated, storageStatus, refresh, run, dismissStorageError } =
    useStoredList(store);

  const add = useCallback((record) => run(() => addHolding(record)), [run]);
  const remove = useCallback((id) => run(() => removeHolding(id)), [run]);
  const resetUnreadable = useCallback(() => run(clearHoldings), [run]);

  return {
    holdings: items,
    hydrated,
    storageStatus,
    add,
    remove,
    resetUnreadable,
    retryRead: refresh,
    dismissStorageError,
  };
}
