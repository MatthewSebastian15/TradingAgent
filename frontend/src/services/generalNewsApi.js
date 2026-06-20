import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';

export async function fetchGeneralNews({
  category = 'all',
  windowDays = 7,
  limit = 50,
  signal,
  forceRefresh = false,
} = {}) {
  const params = new URLSearchParams({
    category,
    window_days: String(windowDays),
    limit: String(limit),
  });

  if (forceRefresh) {
    params.set('force_refresh', 'true');
    params.set('_ts', String(Date.now()));
  }

  const response = await fetch(buildApiUrl(`/news/general?${params.toString()}`), {
    method: 'GET',
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
    cache: forceRefresh ? 'no-store' : 'default',
  });

  if (!response.ok) {
    const error = new Error(`Failed to fetch general news: ${await readHttpError(response)}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}
