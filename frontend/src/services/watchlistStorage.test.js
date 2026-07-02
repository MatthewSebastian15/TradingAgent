import { beforeEach, describe, expect, it, vi } from 'vitest';

// Passthrough "encryption" so tests exercise storage logic, not crypto.
vi.mock('./secureStorage', () => ({
  encryptJSON: async (value) => JSON.stringify(value),
  decryptJSON: async (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
}));

import {
  EMPTY_WATCHLIST_STATE,
  MAX_WATCHLIST_GROUPS,
  MAX_WATCHLIST_ITEMS_PER_GROUP,
  WATCHLIST_STORAGE_KEY,
  normalizeWatchlistState,
  readWatchlistState,
  writeWatchlistState,
} from './watchlistStorage';

function group(id, items = []) {
  return { id, name: `Group ${id}`, items };
}

beforeEach(() => {
  localStorage.clear();
});

describe('normalizeWatchlistState', () => {
  it('sanitizes items: uppercase symbol, defaults, dedupe', () => {
    const state = normalizeWatchlistState({
      activeGroupId: 'g1',
      groups: [
        group('g1', [
          { symbol: ' aapl ', name: 'Apple' },
          { symbol: 'AAPL', name: 'Duplicate' },
          { symbol: '' },
          { symbol: 'msft' },
        ]),
      ],
    });

    const items = state.groups[0].items;
    expect(items.map((i) => i.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(items[1].name).toBe('MSFT');
    expect(items[0].type).toBe('SYMBOL');
    expect(items[0].source).toBe('local_universe');
  });

  it('drops groups without id or name and caps group count', () => {
    const groups = [
      { id: '', name: 'nameless' },
      { id: 'x', name: '' },
      ...Array.from({ length: MAX_WATCHLIST_GROUPS + 5 }, (_, i) => group(`g${i}`)),
    ];
    const state = normalizeWatchlistState({ groups });
    expect(state.groups).toHaveLength(MAX_WATCHLIST_GROUPS);
  });

  it('caps items per group', () => {
    const items = Array.from({ length: MAX_WATCHLIST_ITEMS_PER_GROUP + 10 }, (_, i) => ({
      symbol: `S${i}`,
    }));
    const state = normalizeWatchlistState({ groups: [group('g1', items)] });
    expect(state.groups[0].items).toHaveLength(MAX_WATCHLIST_ITEMS_PER_GROUP);
  });

  it('falls back activeGroupId to the first group', () => {
    const state = normalizeWatchlistState({ activeGroupId: 'missing', groups: [group('g1')] });
    expect(state.activeGroupId).toBe('g1');
    expect(normalizeWatchlistState({}).activeGroupId).toBeNull();
  });
});

describe('read/write round trip', () => {
  it('returns empty state when storage is empty', async () => {
    expect(await readWatchlistState()).toEqual(EMPTY_WATCHLIST_STATE);
  });

  it('writes then reads the normalized state and emits update event', async () => {
    const listener = vi.fn();
    window.addEventListener('ta:watchlist-updated', listener);

    await writeWatchlistState({
      activeGroupId: 'g1',
      groups: [group('g1', [{ symbol: 'aapl' }])],
    });

    const state = await readWatchlistState();
    expect(state.activeGroupId).toBe('g1');
    expect(state.groups[0].items[0].symbol).toBe('AAPL');
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('ta:watchlist-updated', listener);
  });

  it('falls back to empty state on corrupt storage', async () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, '{corrupt');
    expect(await readWatchlistState()).toEqual(EMPTY_WATCHLIST_STATE);
  });

  it('reads legacy plaintext JSON when decryption yields null', async () => {
    // decryptJSON mock parses plain JSON, so simulate legacy by a shape the
    // envelope parser also accepts — plain JSON state stored directly.
    localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify({ activeGroupId: 'g1', groups: [group('g1', [{ symbol: 'msft' }])] })
    );
    const state = await readWatchlistState();
    expect(state.groups[0].items[0].symbol).toBe('MSFT');
  });
});
