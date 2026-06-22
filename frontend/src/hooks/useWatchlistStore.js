import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  EMPTY_WATCHLIST_STATE,
  normalizeWatchlistState,
  readWatchlistState,
  writeWatchlistState,
} from '../services/watchlistStorage';
import { normalizeWatchlistSymbol } from '../utils/watchlistFormatters';

function createGroupId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `grp_${Date.now()}`;
}

function nowIso() {
  return new Date().toISOString();
}

function assertValidGroupName(name, groups, ignoreGroupId = null) {
  const trimmed = String(name || '').trim();

  if (!trimmed) throw new Error('Group name is required.');
  if (trimmed.length > 40) throw new Error('Group name must be 40 characters or less.');

  const duplicate = groups.some(
    (group) =>
      group.id !== ignoreGroupId && group.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) throw new Error('Group name already exists.');

  return trimmed;
}

function normalizeTickerItem(item) {
  const symbol = normalizeWatchlistSymbol(item?.symbol || item);
  if (!symbol) throw new Error('Ticker symbol is required.');

  return {
    symbol,
    name: String(item?.name || symbol).trim(),
    exchange: String(item?.exchange || '')
      .trim()
      .toUpperCase(),
    market: String(item?.market || '')
      .trim()
      .toUpperCase(),
    type: String(item?.type || item?.quoteType || 'SYMBOL')
      .trim()
      .toUpperCase(),
    source: String(item?.source || 'manual_symbol').trim(),
    addedAt: nowIso(),
  };
}

export function useWatchlistStore() {
  const [state, setState] = useState(() => readWatchlistState());

  useEffect(() => {
    writeWatchlistState(state);
  }, [state]);

  useEffect(() => {
    function onWatchlistUpdated() {
      setState((prev) => {
        const next = readWatchlistState();
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    }
    window.addEventListener('ta:watchlist-updated', onWatchlistUpdated);
    return () => window.removeEventListener('ta:watchlist-updated', onWatchlistUpdated);
  }, []);

  const groups = state.groups;
  const activeGroupId = state.activeGroupId;
  const activeGroup = useMemo(
    () => groups.find((group) => group.id === activeGroupId) || null,
    [activeGroupId, groups]
  );

  const setActiveGroupId = useCallback((groupId) => {
    setState((current) => {
      const normalized = normalizeWatchlistState(current);
      const nextActiveGroupId = normalized.groups.some((group) => group.id === groupId)
        ? groupId
        : normalized.activeGroupId;
      return { ...normalized, activeGroupId: nextActiveGroupId };
    });
  }, []);

  const createGroup = useCallback(
    (name) => {
      const trimmed = assertValidGroupName(name, groups);
      const timestamp = nowIso();
      const createdGroup = {
        id: createGroupId(),
        name: trimmed,
        createdAt: timestamp,
        updatedAt: timestamp,
        items: [],
      };

      setState((current) => {
        const normalized = normalizeWatchlistState(current);
        return {
          ...EMPTY_WATCHLIST_STATE,
          activeGroupId: createdGroup.id,
          groups: [...normalized.groups, createdGroup],
        };
      });

      return createdGroup;
    },
    [groups]
  );

  const renameGroup = useCallback(
    (groupId, name) => {
      const trimmed = assertValidGroupName(name, groups, groupId);
      const timestamp = nowIso();

      setState((current) => {
        const normalized = normalizeWatchlistState(current);
        return {
          ...normalized,
          groups: normalized.groups.map((group) =>
            group.id === groupId ? { ...group, name: trimmed, updatedAt: timestamp } : group
          ),
        };
      });
    },
    [groups]
  );

  const deleteGroup = useCallback((groupId) => {
    setState((current) => {
      const normalized = normalizeWatchlistState(current);
      const nextGroups = normalized.groups.filter((group) => group.id !== groupId);
      const nextActiveGroupId =
        normalized.activeGroupId === groupId ? nextGroups[0]?.id || null : normalized.activeGroupId;

      return {
        ...normalized,
        activeGroupId: nextActiveGroupId,
        groups: nextGroups,
      };
    });
  }, []);

  const hasTicker = useCallback(
    (symbol, groupId = activeGroupId) => {
      const normalizedSymbol = normalizeWatchlistSymbol(symbol);
      const group = groups.find((item) => item.id === groupId);
      return Boolean(group?.items.some((item) => item.symbol === normalizedSymbol));
    },
    [activeGroupId, groups]
  );

  const addTicker = useCallback(
    (item, groupId = activeGroupId) => {
      const ticker = normalizeTickerItem(item);
      const targetGroup = groups.find((group) => group.id === groupId);

      if (
        !targetGroup ||
        targetGroup.items.some((existingItem) => existingItem.symbol === ticker.symbol)
      ) {
        return false;
      }

      const timestamp = nowIso();
      setState((current) => {
        const normalized = normalizeWatchlistState(current);
        return {
          ...normalized,
          groups: normalized.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  updatedAt: timestamp,
                  items: [...group.items, ticker],
                }
              : group
          ),
        };
      });

      return true;
    },
    [activeGroupId, groups]
  );

  const removeTicker = useCallback(
    (symbol, groupId = activeGroupId) => {
      const normalizedSymbol = normalizeWatchlistSymbol(symbol);

      setState((current) => {
        const normalized = normalizeWatchlistState(current);
        const timestamp = nowIso();

        return {
          ...normalized,
          groups: normalized.groups.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  updatedAt: timestamp,
                  items: group.items.filter((item) => item.symbol !== normalizedSymbol),
                }
              : group
          ),
        };
      });
    },
    [activeGroupId]
  );

  return {
    groups,
    activeGroup,
    activeGroupId,
    setActiveGroupId,
    createGroup,
    renameGroup,
    deleteGroup,
    addTicker,
    removeTicker,
    hasTicker,
  };
}
