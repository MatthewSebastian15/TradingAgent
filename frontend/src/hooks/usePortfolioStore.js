import { useCallback, useMemo } from 'react';

import { useStoredList } from './useStoredList';
import {
  addTracked,
  clearTracked,
  closeTracked,
  readTrackedDetailed,
  removeTracked,
  reopenTracked,
  TRACKED_STORAGE_KEY,
} from '../services/portfolioStore';

const store = { key: TRACKED_STORAGE_KEY, readDetailed: readTrackedDetailed, clear: clearTracked };

export function usePortfolioStore() {
  const { items, hydrated, storageStatus, refresh, run, dismissStorageError } =
    useStoredList(store);

  const track = useCallback((record) => run(() => addTracked(record)), [run]);
  const untrack = useCallback((id) => run(() => removeTracked(id)), [run]);
  const close = useCallback((id, exitPrice) => run(() => closeTracked(id, exitPrice)), [run]);
  const reopen = useCallback((id) => run(() => reopenTracked(id)), [run]);
  const resetUnreadable = useCallback(() => run(clearTracked), [run]);
  const trackedIds = useMemo(() => new Set(items.map((entry) => entry.id)), [items]);

  return {
    tracked: items,
    trackedIds,
    hydrated,
    storageStatus,
    track,
    untrack,
    close,
    reopen,
    resetUnreadable,
    retryRead: refresh,
    dismissStorageError,
  };
}
