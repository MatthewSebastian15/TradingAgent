import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';

export async function fetchGeneralNews({
  category = 'all',
  windowDays = 7,
  limit = 50,
  signal,
} = {}) {
  const params = new URLSearchParams({
    category,
    window_days: String(windowDays),
    limit: String(limit),
  });

  const response = await fetch(buildApiUrl(`/news/general?${params.toString()}`), {
    method: 'GET',
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch general news: ${await readHttpError(response)}`);
  }

  return response.json();
}
