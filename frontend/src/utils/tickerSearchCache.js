// ponytail: intentionally plaintext — public ticker-search cache, not sensitive. Do not encrypt.
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_PREFIX = 'ta:ticker-search:';
const MAX_STORED_SEARCH_KEYS = 100;

const memoryCache = new Map();

function canUseStorage() {
  return typeof window !== 'undefined' && window.localStorage;
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeFilterValue(value) {
  return String(value || 'ALL')
    .trim()
    .toUpperCase();
}

function normalizedFilters(filters = {}) {
  return {
    market: normalizeFilterValue(filters.market),
    type: normalizeFilterValue(filters.type),
  };
}

export function normalizeTickerSearchCacheKey(query, limit, filters = {}) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 10;
  const nextFilters = normalizedFilters(filters);
  return `${normalizedQuery}::${safeLimit}::${nextFilters.market}::${nextFilters.type}`;
}

function cacheKeyList() {
  try {
    if (!canUseStorage()) return [];
    const raw = window.localStorage.getItem(`${SEARCH_CACHE_PREFIX}keys`);
    return Array.isArray(JSON.parse(raw || '[]')) ? JSON.parse(raw || '[]') : [];
  } catch {
    return [];
  }
}

function storeCacheKey(key) {
  try {
    if (!canUseStorage()) return;
    const keys = [key, ...cacheKeyList().filter((item) => item !== key)].slice(
      0,
      MAX_STORED_SEARCH_KEYS
    );
    const removedKeys = cacheKeyList().filter((item) => !keys.includes(item));
    removedKeys.forEach((item) => window.localStorage.removeItem(`${SEARCH_CACHE_PREFIX}${item}`));
    window.localStorage.setItem(`${SEARCH_CACHE_PREFIX}keys`, JSON.stringify(keys));
  } catch {
    // localStorage can be blocked. Memory cache remains available.
  }
}

function isFresh(payload) {
  return payload && Date.now() - Number(payload.cachedAt || 0) <= SEARCH_CACHE_TTL_MS;
}

export function readTickerSearchCache(query, { limit = 10, filters = {} } = {}) {
  const key = normalizeTickerSearchCacheKey(query, limit, filters);
  const memoryPayload = memoryCache.get(key);
  if (isFresh(memoryPayload)) return cloneValue(memoryPayload);
  if (memoryPayload) memoryCache.delete(key);

  try {
    if (!canUseStorage()) return null;
    const storageKey = `${SEARCH_CACHE_PREFIX}${key}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!isFresh(payload)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    memoryCache.set(key, cloneValue(payload));
    return cloneValue(payload);
  } catch {
    return null;
  }
}

export function writeTickerSearchCache(
  query,
  results,
  { limit = 10, filters = {}, meta = null } = {}
) {
  const key = normalizeTickerSearchCacheKey(query, limit, filters);
  const payload = {
    cachedAt: Date.now(),
    query: String(query || '')
      .trim()
      .toLowerCase(),
    limit,
    filters: normalizedFilters(filters),
    results: cloneValue(Array.isArray(results) ? results : []),
    meta: meta ? cloneValue(meta) : null,
  };

  memoryCache.set(key, cloneValue(payload));
  try {
    if (canUseStorage()) {
      window.localStorage.setItem(`${SEARCH_CACHE_PREFIX}${key}`, JSON.stringify(payload));
      storeCacheKey(key);
    }
  } catch {
    // localStorage can fail in private mode or tests. Ignore it.
  }
  return cloneValue(payload);
}

export function clearExpiredTickerSearchCache() {
  const now = Date.now();
  Array.from(memoryCache.entries()).forEach(([key, payload]) => {
    if (now - Number(payload?.cachedAt || 0) > SEARCH_CACHE_TTL_MS) memoryCache.delete(key);
  });

  try {
    if (!canUseStorage()) return;
    cacheKeyList().forEach((key) => {
      const storageKey = `${SEARCH_CACHE_PREFIX}${key}`;
      const raw = window.localStorage.getItem(storageKey);
      const payload = raw ? JSON.parse(raw) : null;
      if (!isFresh(payload)) window.localStorage.removeItem(storageKey);
    });
  } catch {
    // Ignore broken storage.
  }
}

export function clearTickerSearchCache() {
  memoryCache.clear();
  try {
    if (!canUseStorage()) return;
    cacheKeyList().forEach((key) => window.localStorage.removeItem(`${SEARCH_CACHE_PREFIX}${key}`));
    window.localStorage.removeItem(`${SEARCH_CACHE_PREFIX}keys`);
  } catch {
    // Ignore broken storage.
  }
}
