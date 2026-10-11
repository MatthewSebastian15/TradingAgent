import { useCallback, useEffect, useRef, useState } from 'react';

import { STORAGE_ERROR_EVENT, STORAGE_UPDATED_EVENT } from '../services/encryptedListStore';

// Shared state machine for a device-local encrypted list (holdings, tracked).
// `store` MUST be a stable module-level object: { key, readDetailed(), clear() }.
export function useStoredList(store) {
  const [items, setItems] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState('ok'); // ok | unreadable | write_failed
  const aliveRef = useRef(true);
  const pendingRef = useRef(0);

  const refresh = useCallback(async () => {
    const { items: list, status } = await store.readDetailed();
    if (!aliveRef.current) return;
    setItems(list);
    setHydrated(true);
    const blocked = status === 'unreadable' || status === 'corrupt';
    setStorageStatus((current) => {
      if (blocked) return 'unreadable';
      return current === 'unreadable' ? 'ok' : current;
    });
  }, [store]);

  useEffect(() => {
    aliveRef.current = true;
    refresh();

    // Our own writes refresh explicitly in run(); only react to others here.
    const onUpdated = (event) => {
      if (pendingRef.current === 0 && event.detail?.key === store.key) refresh();
    };
    const onStorage = (event) => {
      if (event.key === null || event.key === store.key) refresh();
    };
    const onWriteFailed = (event) => {
      if (event.detail?.key !== store.key) return;
      setStorageStatus((current) => (current === 'unreadable' ? current : 'write_failed'));
    };
    window.addEventListener(STORAGE_UPDATED_EVENT, onUpdated);
    window.addEventListener('storage', onStorage);
    window.addEventListener(STORAGE_ERROR_EVENT, onWriteFailed);
    return () => {
      aliveRef.current = false;
      window.removeEventListener(STORAGE_UPDATED_EVENT, onUpdated);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STORAGE_ERROR_EVENT, onWriteFailed);
    };
  }, [refresh, store]);

  // Runs a store operation, then re-reads. Resolves to the operation's result.
  const run = useCallback(
    async (operation) => {
      pendingRef.current += 1;
      try {
        const result = await operation();
        await refresh();
        if (result?.ok)
          setStorageStatus((current) => (current === 'write_failed' ? 'ok' : current));
        return result;
      } finally {
        pendingRef.current -= 1;
      }
    },
    [refresh]
  );

  const dismissStorageError = useCallback(() => {
    setStorageStatus((current) => (current === 'write_failed' ? 'ok' : current));
  }, []);

  return { items, hydrated, storageStatus, refresh, run, dismissStorageError };
}
