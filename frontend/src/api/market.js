import { buildApiUrl, buildAuthHeaders, buildHeaders, readHttpError } from '../utils/api';

async function parseMarketResponse(response) {
  if (!response.ok) throw new Error(await readHttpError(response));
  return response.json();
}

export async function getMarketPresets({ signal } = {}) {
  const response = await fetch(buildApiUrl('/market/presets'), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
  return parseMarketResponse(response);
}

export async function validateMarketSymbol(symbol, { signal } = {}) {
  const response = await fetch(
    buildApiUrl(`/market/validate-symbol?symbol=${encodeURIComponent(symbol)}`),
    {
      headers: await buildAuthHeaders(),
      credentials: 'include',
      signal,
    }
  );
  return parseMarketResponse(response);
}

export async function getMarketOverview(symbols, { signal } = {}) {
  const response = await fetch(buildApiUrl('/market/overview'), {
    method: 'POST',
    headers: await buildHeaders(),
    credentials: 'include',
    body: JSON.stringify({ symbols }),
    signal,
  });
  return parseMarketResponse(response);
}

export async function getMarketMovers({ country, exchange, limit }, { signal } = {}) {
  const params = new URLSearchParams({
    country,
    exchange,
    limit: String(limit),
  });
  const response = await fetch(buildApiUrl(`/market/movers?${params.toString()}`), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
  return parseMarketResponse(response);
}
