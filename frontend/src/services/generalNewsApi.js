import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';

const GENERAL_NEWS_REQUEST_TIMEOUT_MS = 15000;

function buildGeneralNewsParams({ category = 'all', windowDays = 7, limit = 100 } = {}) {
  return new URLSearchParams({
    category,
    window_days: String(windowDays),
    limit: String(limit),
  });
}

function normalizeGeneralNewsResponse(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  let articles = [];

  if (Array.isArray(data.articles)) articles = data.articles;
  else if (Array.isArray(data.items)) articles = data.items;
  else if (Array.isArray(data.news)) articles = data.news;
  else if (Array.isArray(data.data)) articles = data.data;

  return {
    ...data,
    articles,
    articles_found: Number(data.articles_found ?? data.count ?? articles.length) || articles.length,
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const parentSignal = options.signal;
  let timedOut = false;

  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) controller.abort();
  if (parentSignal) parentSignal.addEventListener('abort', abortFromParent, { once: true });

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GENERAL_NEWS_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(
        'General news request timed out. Showing cached data if available.'
      );
      timeoutError.name = 'TimeoutError';
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    if (parentSignal) parentSignal.removeEventListener('abort', abortFromParent);
  }
}

async function readGeneralNews({ category = 'all', windowDays = 7, limit = 100, signal } = {}) {
  const params = buildGeneralNewsParams({ category, windowDays, limit });
  const response = await fetchWithTimeout(buildApiUrl(`/news/general?${params.toString()}`), {
    method: 'GET',
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
    cache: 'default',
  });

  if (!response.ok) {
    const error = new Error(`Failed to fetch general news: ${await readHttpError(response)}`);
    error.status = response.status;
    throw error;
  }

  return normalizeGeneralNewsResponse(await response.json());
}

export async function requestGeneralNewsRefresh({
  category = 'all',
  windowDays = 7,
  limit = 100,
  signal,
} = {}) {
  const params = buildGeneralNewsParams({ category, windowDays, limit });
  const response = await fetchWithTimeout(
    buildApiUrl(`/news/general/refresh?${params.toString()}`),
    {
      method: 'POST',
      headers: await buildAuthHeaders(),
      credentials: 'include',
      signal,
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const error = new Error(`Failed to queue general news refresh: ${await readHttpError(response)}`);
    error.status = response.status;
    throw error;
  }

  return normalizeGeneralNewsResponse(await response.json());
}

export async function fetchGeneralNews({
  category = 'all',
  windowDays = 7,
  limit = 100,
  signal,
  forceRefresh = false,
} = {}) {
  if (!forceRefresh) {
    return readGeneralNews({ category, windowDays, limit, signal });
  }

  const refreshResult = await requestGeneralNewsRefresh({ category, windowDays, limit, signal });
  return normalizeGeneralNewsResponse(refreshResult);
}
