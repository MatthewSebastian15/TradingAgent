import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStoredList } from './useStoredList';
import { STORAGE_ERROR_EVENT, STORAGE_UPDATED_EVENT } from '../services/encryptedListStore';

function makeStore(initial) {
  const state = { result: initial };
  return {
    state,
    key: 'k',
    readDetailed: vi.fn(async () => state.result),
    clear: vi.fn(async () => {
      state.result = { items: [], status: 'empty' };
      return { ok: true };
    }),
  };
}

describe('useStoredList', () => {
  it('hydrates items and starts ok', async () => {
    const store = makeStore({ items: [{ id: 'a' }], status: 'ok' });
    const { result } = renderHook(() => useStoredList(store));

    expect(result.current.hydrated).toBe(false);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.items).toEqual([{ id: 'a' }]);
    expect(result.current.storageStatus).toBe('ok');
  });

  it('flags unreadable storage and recovers after clear', async () => {
    const store = makeStore({ items: [], status: 'unreadable' });
    const { result } = renderHook(() => useStoredList(store));

    await waitFor(() => expect(result.current.storageStatus).toBe('unreadable'));
    await act(() => result.current.run(() => store.clear()));
    expect(result.current.storageStatus).toBe('ok');
  });

  it('refreshes when another tab writes (native storage event) and ignores other keys', async () => {
    const store = makeStore({ items: [], status: 'empty' });
    const { result } = renderHook(() => useStoredList(store));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const baseline = store.readDetailed.mock.calls.length;

    store.state.result = { items: [{ id: 'x' }], status: 'ok' };
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'some_other_key' }));
    });
    expect(store.readDetailed.mock.calls.length).toBe(baseline);

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'k' }));
    });
    await waitFor(() => expect(result.current.items).toEqual([{ id: 'x' }]));
  });

  it('shows write_failed from the error event and clears it after a successful run', async () => {
    const store = makeStore({ items: [], status: 'empty' });
    const { result } = renderHook(() => useStoredList(store));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(STORAGE_ERROR_EVENT, { detail: { key: 'k', name: 'QuotaExceededError' } })
      );
    });
    expect(result.current.storageStatus).toBe('write_failed');

    await act(() => result.current.run(async () => ({ ok: true })));
    expect(result.current.storageStatus).toBe('ok');
  });

  it('does not refresh twice for its own writes', async () => {
    const store = makeStore({ items: [], status: 'empty' });
    const { result } = renderHook(() => useStoredList(store));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const baseline = store.readDetailed.mock.calls.length;

    await act(() =>
      result.current.run(async () => {
        window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { key: 'k' } }));
        return { ok: true };
      })
    );

    expect(store.readDetailed.mock.calls.length).toBe(baseline + 1);
  });
});
