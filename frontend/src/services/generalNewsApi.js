import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';

function buildGeneralNewsParams({ category = 'all', windowDays = 7, limit = 100 } = {}) {
  return new URLSearchParams({
    category,
    window_days: String(windowDays),
    limit: String(limit),
  });
}

async function readGeneralNews({ category = 'all', windowDays = 7, limit = 100, signal } = {}) {
  const params = buildGeneralNewsParams({ category, windowDays, limit });
  const response = await fetch(buildApiUrl(`/news/general?${params.toString()}`), {
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

  return response.json();
}

export async function requestGeneralNewsRefresh({
  category = 'all',
  windowDays = 7,
  limit = 100,
  signal,
} = {}) {
  const params = buildGeneralNewsParams({ category, windowDays, limit });
  const response = await fetch(buildApiUrl(`/news/general/refresh?${params.toString()}`), {
    method: 'POST',
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = new Error(`Failed to queue general news refresh: ${await readHttpError(response)}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
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
  const data = await readGeneralNews({ category, windowDays, limit, signal });
  return {
    ...data,
    message: refreshResult.message || data.message,
    refresh: {
      ...(data.refresh || {}),
      ...(refreshResult.refresh || {}),
    },
  };
}
