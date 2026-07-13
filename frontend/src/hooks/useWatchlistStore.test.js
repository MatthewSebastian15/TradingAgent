import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useWatchlistStore } from './useWatchlistStore';
import { decryptJSON } from '../services/secureStorage';
import { pendingWatchlistWriteForTests, WATCHLIST_STORAGE_KEY } from '../services/watchlistStorage';

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

// Unmount previous hooks: a stale instance hears 'ta:watchlist-updated' and
// re-persists its old groups into the next test's clean storage.
afterEach(cleanup);

beforeEach(async () => {
  // A straggler encrypted write from the previous test must settle before the
  // wipe, or it re-persists stale groups into this test's clean storage.
  await pendingWatchlistWriteForTests();
  window.localStorage.clear();
});

// Mount the hook and wait for its async (encrypted) read to hydrate state.
async function mountStore() {
  const rendered = renderHook(() => useWatchlistStore());
  await act(async () => {});
  return rendered;
}

describe('useWatchlistStore', () => {
  it('starts empty when localStorage is empty', async () => {
    const { result } = await mountStore();

    expect(result.current.groups).toEqual([]);
    expect(result.current.activeGroup).toBeNull();
  });

  it('creates a group and makes it active', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].name).toBe('US Tech');
    expect(result.current.activeGroupId).toBe(result.current.groups[0].id);
  });

  it('rejects duplicate group names case-insensitively', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));

    expect(() => {
      act(() => result.current.createGroup('us tech'));
    }).toThrow('Group name already exists.');
  });

  it('adds and removes a ticker in the active group', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.addTicker({ symbol: 'nvda', name: 'NVIDIA Corporation' }));

    expect(result.current.activeGroup.items).toEqual([
      expect.objectContaining({ symbol: 'NVDA', name: 'NVIDIA Corporation' }),
    ]);
    expect(result.current.hasTicker('NVDA')).toBe(true);

    act(() => result.current.removeTicker('NVDA'));

    expect(result.current.activeGroup.items).toEqual([]);
  });

  it('does not add duplicate tickers in the same group', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.addTicker({ symbol: 'AAPL' }));
    let added = true;
    act(() => {
      added = result.current.addTicker({ symbol: 'aapl' });
    });

    expect(added).toBe(false);
    expect(result.current.activeGroup.items).toHaveLength(1);
  });

  it('allows the same ticker in different groups', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));
    const firstGroupId = result.current.activeGroupId;
    act(() => result.current.addTicker({ symbol: 'AAPL' }, firstGroupId));
    act(() => result.current.createGroup('Favorites'));
    const secondGroupId = result.current.activeGroupId;
    act(() => result.current.addTicker({ symbol: 'AAPL' }, secondGroupId));

    expect(result.current.groups[0].items).toHaveLength(1);
    expect(result.current.groups[1].items).toHaveLength(1);
  });

  it('deletes a group and moves active group to the first remaining group', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));
    const firstGroupId = result.current.activeGroupId;
    act(() => result.current.createGroup('Crypto'));

    act(() => result.current.deleteGroup(result.current.activeGroupId));

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.activeGroupId).toBe(firstGroupId);
  });

  it('sets activeGroupId to null when the last group is deleted', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.deleteGroup(result.current.activeGroupId));

    expect(result.current.groups).toEqual([]);
    expect(result.current.activeGroupId).toBeNull();
  });

  it('saves encrypted data to localStorage', async () => {
    const { result } = await mountStore();

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.addTicker({ symbol: 'MSFT' }));

    // Writes are async (encrypt + IndexedDB). Poll until the MSFT entry lands.
    // ponytail: 5s timeout — default 1s flakes on slow CI runners (Web Crypto). (deliberate)
    await waitFor(
      async () => {
        const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
        expect(raw).toContain('"iv"'); // encrypted envelope, not plaintext
        const stored = await decryptJSON(raw);
        expect(stored?.groups?.[0]?.name).toBe('US Tech');
        expect(stored?.groups?.[0]?.items?.[0]?.symbol).toBe('MSFT');
      },
      { timeout: 5000 }
    );
  });
});
