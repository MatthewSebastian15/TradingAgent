import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';

// GET /api/economic/{source}/{command}?<params> → { success, valueType, data:[{date,value}] }
export async function getEconomicData(source, command, { params = {}, signal } = {}) {
  const query = new URLSearchParams(params).toString();
  const path = `/economic/${source}/${command}${query ? `?${query}` : ''}`;
  const response = await fetch(buildApiUrl(path), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
  if (!response.ok) throw new Error(await readHttpError(response));
  return response.json();
}
