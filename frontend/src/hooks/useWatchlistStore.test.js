import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWatchlistStore } from './useWatchlistStore';
import { WATCHLIST_STORAGE_KEY } from '../services/watchlistStorage';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useWatchlistStore', () => {
  it('starts empty when localStorage is empty', () => {
    const { result } = renderHook(() => useWatchlistStore());

    expect(result.current.groups).toEqual([]);
    expect(result.current.activeGroup).toBeNull();
  });

  it('creates a group and makes it active', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].name).toBe('US Tech');
    expect(result.current.activeGroupId).toBe(result.current.groups[0].id);
  });

  it('rejects duplicate group names case-insensitively', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));

    expect(() => {
      act(() => result.current.createGroup('us tech'));
    }).toThrow('Group name already exists.');
  });

  it('adds and removes a ticker in the active group', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.addTicker({ symbol: 'nvda', name: 'NVIDIA Corporation' }));

    expect(result.current.activeGroup.items).toEqual([
      expect.objectContaining({ symbol: 'NVDA', name: 'NVIDIA Corporation' }),
    ]);
    expect(result.current.hasTicker('NVDA')).toBe(true);

    act(() => result.current.removeTicker('NVDA'));

    expect(result.current.activeGroup.items).toEqual([]);
  });

  it('does not add duplicate tickers in the same group', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.addTicker({ symbol: 'AAPL' }));
    let added = true;
    act(() => {
      added = result.current.addTicker({ symbol: 'aapl' });
    });

    expect(added).toBe(false);
    expect(result.current.activeGroup.items).toHaveLength(1);
  });

  it('allows the same ticker in different groups', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));
    const firstGroupId = result.current.activeGroupId;
    act(() => result.current.addTicker({ symbol: 'AAPL' }, firstGroupId));
    act(() => result.current.createGroup('Favorites'));
    const secondGroupId = result.current.activeGroupId;
    act(() => result.current.addTicker({ symbol: 'AAPL' }, secondGroupId));

    expect(result.current.groups[0].items).toHaveLength(1);
    expect(result.current.groups[1].items).toHaveLength(1);
  });

  it('deletes a group and moves active group to the first remaining group', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));
    const firstGroupId = result.current.activeGroupId;
    act(() => result.current.createGroup('Crypto'));

    act(() => result.current.deleteGroup(result.current.activeGroupId));

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.activeGroupId).toBe(firstGroupId);
  });

  it('sets activeGroupId to null when the last group is deleted', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.deleteGroup(result.current.activeGroupId));

    expect(result.current.groups).toEqual([]);
    expect(result.current.activeGroupId).toBeNull();
  });

  it('saves data to localStorage', () => {
    const { result } = renderHook(() => useWatchlistStore());

    act(() => result.current.createGroup('US Tech'));
    act(() => result.current.addTicker({ symbol: 'MSFT' }));

    const stored = JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY));

    expect(stored.groups[0].name).toBe('US Tech');
    expect(stored.groups[0].items[0].symbol).toBe('MSFT');
  });
});
