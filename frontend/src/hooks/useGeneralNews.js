import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchGeneralNews } from '../services/generalNewsApi';

const POLL_MS = 120000;
const REQUEST_DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 45000;
const MANUAL_REFRESH_COOLDOWN_MS = 10000;
const ERROR_BACKOFF_MS = 60000;
const RATE_LIMIT_BACKOFF_MS = 90000;

const responseCache = new Map();
const inflightRequests = new Map();
const backoffUntilByKey = new Map();

function buildCacheKey({ category, windowDays, limit }) {
  return `${category || 'all'}:${windowDays || 7}:${limit || 50}`;
}

function nowMs() {
  return Date.now();
}

function getErrorStatus(error) {
  return Number(error?.status || error?.response?.status || 0);
}

function cacheFresh(entry) {
  return entry && nowMs() - entry.fetchedAt < CACHE_TTL_MS;
}

function backoffMsForError(error) {
  return getErrorStatus(error) === 429 ? RATE_LIMIT_BACKOFF_MS : ERROR_BACKOFF_MS;
}

async function loadGeneralNews({ category, windowDays, limit, force = false }) {
  const key = buildCacheKey({ category, windowDays, limit });
  const cached = responseCache.get(key);

  if (!force && cacheFresh(cached)) {
    return cached.data;
  }

  if (inflightRequests.has(key)) {
    return inflightRequests.get(key);
  }

  const backoffUntil = backoffUntilByKey.get(key) || 0;
  if (backoffUntil > nowMs()) {
    if (cached?.data) return cached.data;
    throw new Error('General news refresh is cooling down after a recent failed request.');
  }

  const request = fetchGeneralNews({ category, windowDays, limit })
    .then((data) => {
      responseCache.set(key, { data, fetchedAt: nowMs() });
      backoffUntilByKey.delete(key);
      return data;
    })
    .catch((error) => {
      backoffUntilByKey.set(key, nowMs() + backoffMsForError(error));
      if (cached?.data) return cached.data;
      throw error;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, request);
  return request;
}

export function clearGeneralNewsClientStateForTests() {
  responseCache.clear();
  inflightRequests.clear();
  backoffUntilByKey.clear();
}

export function useGeneralNews({ category = 'all', windowDays = 7, limit = 50 }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const lastManualRefreshRef = useRef(0);

  const load = useCallback(
    async ({ force = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setStatus((current) => (current === 'success' ? 'refreshing' : 'loading'));
      setError(null);

      try {
        const result = await loadGeneralNews({ category, windowDays, limit, force });
        if (!mountedRef.current || requestIdRef.current !== requestId) return result;
        setData(result);
        setStatus('success');
        setError(null);
        return result;
      } catch (err) {
        if (!mountedRef.current || requestIdRef.current !== requestId) return null;
        setError(err);
        setStatus('error');
        return null;
      }
    },
    [category, limit, windowDays]
  );

  const reload = useCallback(() => {
    const currentTime = nowMs();
    if (
      lastManualRefreshRef.current &&
      currentTime - lastManualRefreshRef.current < MANUAL_REFRESH_COOLDOWN_MS
    ) {
      return Promise.resolve(data);
    }

    lastManualRefreshRef.current = currentTime;
    return load({ force: true });
  }, [data, load]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      load();
    }, REQUEST_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      load();
    }, POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [load]);

  return {
    data,
    status,
    error,
    reload,
  };
}
