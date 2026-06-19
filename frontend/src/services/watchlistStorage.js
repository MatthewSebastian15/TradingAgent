export const WATCHLIST_STORAGE_KEY = 'tradingagents:watchlists:v1';
export const WATCHLIST_STORAGE_VERSION = 1;

export const EMPTY_WATCHLIST_STATE = {
  version: WATCHLIST_STORAGE_VERSION,
  activeGroupId: null,
  groups: [],
};

function cloneState(state) {
  return {
    version: WATCHLIST_STORAGE_VERSION,
    activeGroupId: state?.activeGroupId || null,
    groups: Array.isArray(state?.groups)
      ? state.groups.map((group) => ({
          ...group,
          items: Array.isArray(group.items) ? group.items.map((item) => ({ ...item })) : [],
        }))
      : [],
  };
}

function sanitizeItem(item) {
  const symbol = String(item?.symbol || '')
    .trim()
    .toUpperCase();
  if (!symbol) return null;

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
    source: String(item?.source || 'local_universe').trim(),
    addedAt: item?.addedAt || new Date().toISOString(),
  };
}

function sanitizeGroup(group) {
  const id = String(group?.id || '').trim();
  const name = String(group?.name || '').trim();
  if (!id || !name) return null;

  const seen = new Set();
  const items = (Array.isArray(group.items) ? group.items : [])
    .map(sanitizeItem)
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item.symbol)) return false;
      seen.add(item.symbol);
      return true;
    });

  return {
    id,
    name,
    createdAt: group?.createdAt || new Date().toISOString(),
    updatedAt: group?.updatedAt || new Date().toISOString(),
    items,
  };
}

export function normalizeWatchlistState(value) {
  const groups = (Array.isArray(value?.groups) ? value.groups : [])
    .map(sanitizeGroup)
    .filter(Boolean);
  const activeGroupId = groups.some((group) => group.id === value?.activeGroupId)
    ? value.activeGroupId
    : groups[0]?.id || null;

  return {
    version: WATCHLIST_STORAGE_VERSION,
    activeGroupId,
    groups,
  };
}

export function readWatchlistState() {
  if (typeof window === 'undefined') return cloneState(EMPTY_WATCHLIST_STATE);

  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return cloneState(EMPTY_WATCHLIST_STATE);
    return normalizeWatchlistState(JSON.parse(raw));
  } catch {
    return cloneState(EMPTY_WATCHLIST_STATE);
  }
}

export function writeWatchlistState(state) {
  const normalized = normalizeWatchlistState(state);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Keep the in-memory React state usable when browser storage is blocked.
    }
  }

  return normalized;
}
