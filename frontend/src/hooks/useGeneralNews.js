import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchGeneralNews } from '../services/generalNewsApi';

const NEWS_AUTO_REFRESH_INTERVAL_MS = 60000;
const NEWS_VISIBILITY_REFRESH_MIN_GAP_MS = 15000;
const MIN_REFRESH_SKELETON_MS = 700;
const NEWS_LOADING_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 120000;
const STORAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = 'tradingagents:general-news:v2:';
const ERROR_BACKOFF_MS = 60000;
const RATE_LIMIT_BACKOFF_MS = 90000;
export const MANUAL_REFRESH_COOLDOWN_MS = 90_000;
const LAST_FORCE_REFRESH_KEY = 'ta:last-news-force-refresh';

const responseCache = new Map();
const inflightRequests = new Map();
const backoffUntilByKey = new Map();
const lastForceRefreshByKey = new Map();

function buildCacheKey({ category, windowDays, limit }) {
  return `${category || 'all'}:${windowDays || 7}:${limit || 100}`;
}

function nowMs() {
  return Date.now();
}

function getErrorStatus(error) {
  return Number(error?.status || error?.response?.status || 0);
}

function cacheFresh(entry, ttlMs = CACHE_TTL_MS) {
  return entry && nowMs() - Number(entry.fetchedAt || 0) < ttlMs;
}

function backoffMsForError(error) {
  return getErrorStatus(error) === 429 ? RATE_LIMIT_BACKOFF_MS : ERROR_BACKOFF_MS;
}

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

function forceRefreshStorageKey(key) {
  return `${LAST_FORCE_REFRESH_KEY}:${key}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createLoadingTimeoutError() {
  const error = new Error('General news request timed out. Showing cached data if available.');
  error.name = 'TimeoutError';
  error.status = 408;
  return error;
}

function readStoredCache(key) {
  if (typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey(key)) || 'null');
    if (!parsed || !parsed.data || !cacheFresh(parsed, STORAGE_CACHE_TTL_MS)) return null;
    responseCache.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredCache(key, entry) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch {
    // Memory cache still avoids duplicate requests if browser storage fails.
  }
}

function readLastForceRefreshAt(key) {
  if (typeof window === 'undefined') return lastForceRefreshByKey.get(key) || 0;

  try {
    return Number(window.localStorage.getItem(forceRefreshStorageKey(key)) || 0);
  } catch {
    return lastForceRefreshByKey.get(key) || 0;
  }
}

function markForceRefresh(key) {
  const value = nowMs();
  lastForceRefreshByKey.set(key, value);
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(forceRefreshStorageKey(key), String(value));
  } catch {
    // Memory fallback already recorded the timestamp.
  }
}

function canForceRefresh(key) {
  return nowMs() - readLastForceRefreshAt(key) > MANUAL_REFRESH_COOLDOWN_MS;
}

function decorateCooldownData(data) {
  return {
    ...(data || {}),
    message: 'Refresh is cooling down. Showing latest cached news.',
    refresh: {
      ...(data?.refresh || {}),
      queued: false,
      skipped: true,
      reason: 'manual_refresh_cooldown',
    },
  };
}

function readAnyFreshCache(key) {
  const memoryEntry = responseCache.get(key);
  if (cacheFresh(memoryEntry)) return memoryEntry;

  return readStoredCache(key);
}

function clearStoredCaches() {
  if (typeof window === 'undefined') return;

  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore test/browser storage cleanup failures.
  }
}

function clearForceRefreshMarkers() {
  if (typeof window === 'undefined') return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LAST_FORCE_REFRESH_KEY)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore test/browser storage cleanup failures.
  }
}

function cachedDataForParams({ category, windowDays, limit }) {
  const key = buildCacheKey({ category, windowDays, limit });
  const cached = readAnyFreshCache(key);
  return cached?.data || null;
}

async function loadGeneralNews({ category, windowDays, limit, force = false, signal }) {
  const key = buildCacheKey({ category, windowDays, limit });
  const cached = readAnyFreshCache(key);
  let effectiveForce = force;
  let cooledDown = false;

  if (force) {
    if (!canForceRefresh(key)) {
      effectiveForce = false;
      cooledDown = true;
    } else {
      markForceRefresh(key);
    }
  }

  if (!effectiveForce && cacheFresh(cached)) {
    return cooledDown ? decorateCooldownData(cached.data) : cached.data;
  }

  if (!effectiveForce && inflightRequests.has(key)) {
    const result = await inflightRequests.get(key);
    return cooledDown ? decorateCooldownData(result) : result;
  }

  const backoffUntil = backoffUntilByKey.get(key) || 0;
  if (!effectiveForce && backoffUntil > nowMs()) {
    if (cached?.data) return cooledDown ? decorateCooldownData(cached.data) : cached.data;
    throw new Error('General news refresh is cooling down after a recent failed request.');
  }

  const requestKey = effectiveForce ? `${key}:force` : key;
  if (inflightRequests.has(requestKey)) {
    const result = await inflightRequests.get(requestKey);
    return cooledDown ? decorateCooldownData(result) : result;
  }

  const request = fetchGeneralNews({
    category,
    windowDays,
    limit,
    forceRefresh: effectiveForce,
    signal,
  })
    .then((data) => {
      const result = cooledDown ? decorateCooldownData(data) : data;
      const entry = { data: result, fetchedAt: nowMs() };
      responseCache.set(key, entry);
      writeStoredCache(key, entry);
      backoffUntilByKey.delete(key);
      return result;
    })
    .catch((error) => {
      if (error?.name !== 'AbortError') {
        backoffUntilByKey.set(key, nowMs() + backoffMsForError(error));
      }
      if (cached?.data) return cooledDown ? decorateCooldownData(cached.data) : cached.data;
      throw error;
    })
    .finally(() => {
      inflightRequests.delete(requestKey);
    });

  inflightRequests.set(requestKey, request);
  return request;
}

function isReloadOptions(value) {
  return (
    value &&
    typeof value === 'object' &&
    ('force' in value || 'silent' in value || 'signal' in value)
  );
}

export function clearGeneralNewsClientStateForTests() {
  responseCache.clear();
  inflightRequests.clear();
  backoffUntilByKey.clear();
  lastForceRefreshByKey.clear();
  clearStoredCaches();
  clearForceRefreshMarkers();
}

export function useGeneralNews({ category = 'all', windowDays = 7, limit = 100 }) {
  const [{ data: initialData, status: initialStatus }] = useState(() => {
    const cachedData = cachedDataForParams({ category, windowDays, limit });
    return {
      data: cachedData,
      status: cachedData ? 'success' : 'idle',
    };
  });
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const dataRef = useRef(initialData);
  const lastRefreshAtRef = useRef(initialData ? nowMs() : 0);

  const load = useCallback(
    async ({ force = false, silent = false, signal } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const shouldHoldSkeleton = force && !silent;
      const startedAt = nowMs();
      let loadingTimeoutId = null;

      if (!silent) {
        setStatus(dataRef.current ? 'refreshing' : 'loading');
        loadingTimeoutId = window.setTimeout(() => {
          if (!mountedRef.current || requestIdRef.current !== requestId) return;
          const timeoutError = createLoadingTimeoutError();
          setError(timeoutError);
          setStatus(dataRef.current ? 'stale' : 'error');
        }, NEWS_LOADING_TIMEOUT_MS);
      }
      setError(null);

      try {
        const result = await loadGeneralNews({ category, windowDays, limit, force, signal });
        if (shouldHoldSkeleton) {
          await sleep(Math.max(0, MIN_REFRESH_SKELETON_MS - (nowMs() - startedAt)));
        }
        if (signal?.aborted || !mountedRef.current || requestIdRef.current !== requestId) {
          return result;
        }
        dataRef.current = result;
        setData(result);
        setStatus('success');
        setError(null);
        lastRefreshAtRef.current = nowMs();
        return result;
      } catch (err) {
        if (shouldHoldSkeleton) {
          await sleep(Math.max(0, MIN_REFRESH_SKELETON_MS - (nowMs() - startedAt)));
        }
        if (err?.name === 'AbortError') return null;
        if (!mountedRef.current || requestIdRef.current !== requestId) return null;
        setError(err);
        setStatus(dataRef.current ? 'stale' : 'error');
        return null;
      } finally {
        if (loadingTimeoutId) window.clearTimeout(loadingTimeoutId);
      }
    },
    [category, limit, windowDays]
  );

  const reload = useCallback(
    (options = {}) => {
      const reloadOptions = isReloadOptions(options) ? options : {};
      return load({
        force: reloadOptions.force ?? true,
        silent: reloadOptions.silent ?? false,
        signal: reloadOptions.signal,
      });
    },
    [load]
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const cachedData = cachedDataForParams({ category, windowDays, limit });
    if (cachedData) {
      dataRef.current = cachedData;
      setData(cachedData);
      setStatus('success');
    } else {
      dataRef.current = null;
      setData(null);
      setStatus('idle');
    }

    const controller = new AbortController();
    load({ force: false, silent: false, signal: controller.signal }).catch(() => {});

    return () => {
      controller.abort();
    };
  }, [category, limit, load, windowDays]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        load({ force: false, silent: true }).catch(() => {});
      }
    }, NEWS_AUTO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [load]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const elapsed = nowMs() - lastRefreshAtRef.current;
      if (elapsed < NEWS_VISIBILITY_REFRESH_MIN_GAP_MS) return;

      load({ force: false, silent: true }).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [load]);

  return {
    data,
    status,
    error,
    reload,
  };
}
