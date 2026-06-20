import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchGeneralNews } from '../services/generalNewsApi';

const NEWS_AUTO_REFRESH_INTERVAL_MS = 60000;
const NEWS_VISIBILITY_REFRESH_MIN_GAP_MS = 15000;
const CACHE_TTL_MS = 120000;
const STORAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const STORAGE_PREFIX = 'tradingagents:general-news:v2:';
const ERROR_BACKOFF_MS = 60000;
const RATE_LIMIT_BACKOFF_MS = 90000;

const responseCache = new Map();
const inflightRequests = new Map();
const backoffUntilByKey = new Map();
let forceRequestSequence = 0;

function buildCacheKey({ category, windowDays, limit }) {
  return `${category || 'all'}:${windowDays || 7}:${limit || 50}`;
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
    // Cache storage can fail. Memory cache still avoids duplicate requests.
  }
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

function cachedDataForParams({ category, windowDays, limit }) {
  const key = buildCacheKey({ category, windowDays, limit });
  const cached = readAnyFreshCache(key);
  return cached?.data || null;
}

async function loadGeneralNews({ category, windowDays, limit, force = false }) {
  const key = buildCacheKey({ category, windowDays, limit });
  const cached = readAnyFreshCache(key);

  if (!force && cacheFresh(cached)) {
    return cached.data;
  }

  if (!force && inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const backoffUntil = backoffUntilByKey.get(key) || 0;
  if (!force && backoffUntil > nowMs()) {
    if (cached?.data) return cached.data;
    throw new Error('General news refresh is cooling down after a recent failed request.');
  }

  const requestKey = force ? `${key}:force:${nowMs()}:${(forceRequestSequence += 1)}` : key;
  const request = fetchGeneralNews({ category, windowDays, limit, forceRefresh: force })
    .then((data) => {
      const entry = { data, fetchedAt: nowMs() };
      responseCache.set(key, entry);
      writeStoredCache(key, entry);
      backoffUntilByKey.delete(key);
      return data;
    })
    .catch((error) => {
      backoffUntilByKey.set(key, nowMs() + backoffMsForError(error));
      if (!force && cached?.data) return cached.data;
      throw error;
    })
    .finally(() => {
      inflightRequests.delete(requestKey);
    });

  inflightRequests.set(requestKey, request);
  return request;
}

export function clearGeneralNewsClientStateForTests() {
  responseCache.clear();
  inflightRequests.clear();
  backoffUntilByKey.clear();
  forceRequestSequence = 0;
  clearStoredCaches();
}

export function useGeneralNews({ category = 'all', windowDays = 7, limit = 50 }) {
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
    async ({ force = false, silent = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!silent) {
        setStatus(dataRef.current ? 'refreshing' : 'loading');
      }
      setError(null);

      try {
        const result = await loadGeneralNews({ category, windowDays, limit, force });
        if (!mountedRef.current || requestIdRef.current !== requestId) return result;
        dataRef.current = result;
        setData(result);
        setStatus('success');
        setError(null);
        lastRefreshAtRef.current = nowMs();
        return result;
      } catch (err) {
        if (!mountedRef.current || requestIdRef.current !== requestId) return null;
        setError(err);
        setStatus(dataRef.current ? 'success' : 'error');
        return null;
      }
    },
    [category, limit, windowDays]
  );

  const reload = useCallback(() => load({ force: true, silent: false }), [load]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    load({ force: false, silent: false }).catch(() => {});
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        load({ force: true, silent: true }).catch(() => {});
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

      load({ force: true, silent: true }).catch(() => {});
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
