import { buildApiUrl, buildAuthHeaders, readHttpError } from './api';

export async function fetchAnalysisHistory({ ticker = '', limit = 25, signal } = {}) {
  const params = new URLSearchParams();
  if (ticker) params.set('ticker', ticker);
  params.set('limit', String(limit));

  const response = await fetch(buildApiUrl(`/analysis/history?${params.toString()}`), {
    method: 'GET',
    headers: {
      ...(await buildAuthHeaders()),
      Accept: 'application/json',
    },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw new Error(await readHttpError(response));
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function fetchAnalysisHistoryResult(requestId, { signal } = {}) {
  const response = await fetch(buildApiUrl(`/analysis/history/${encodeURIComponent(requestId)}`), {
    method: 'GET',
    headers: {
      ...(await buildAuthHeaders()),
      Accept: 'application/json',
    },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw new Error(await readHttpError(response));
  return response.json();
}

export async function deleteAnalysisHistoryResult(requestId) {
  const response = await fetch(buildApiUrl(`/analysis/history/${encodeURIComponent(requestId)}`), {
    method: 'DELETE',
    headers: await buildAuthHeaders(),
    credentials: 'include',
  });

  if (!response.ok) throw new Error(await readHttpError(response));
  return response.json();
}

export async function clearAnalysisHistory() {
  const response = await fetch(buildApiUrl('/analysis/history'), {
    method: 'DELETE',
    headers: await buildAuthHeaders(),
    credentials: 'include',
  });

  if (!response.ok) throw new Error(await readHttpError(response));
  return response.json();
}
