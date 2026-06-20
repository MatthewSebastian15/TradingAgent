import { buildApiUrl, buildAuthHeaders, readHttpError } from '@/utils/api';

export async function fetchTickerNews({
  ticker,
  windowDays = 30,
  limit = 30,
  provider,
  forceRefresh = false,
  signal,
}) {
  const params = new URLSearchParams();
  params.set('window_days', String(windowDays));
  params.set('limit', String(limit));
  if (provider) params.set('provider', provider);
  if (forceRefresh) params.set('force_refresh', 'true');

  const response = await fetch(buildApiUrl(`/news/${encodeURIComponent(ticker)}?${params}`), {
    method: 'GET',
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(await readHttpError(response));
  }

  return response.json();
}
