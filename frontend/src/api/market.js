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

export async function searchMarketTickers(query, { limit = 10, signal } = {}) {
  const params = new URLSearchParams({
    q: String(query || ''),
    limit: String(limit),
  });
  const response = await fetch(buildApiUrl(`/market/search?${params.toString()}`), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
  return parseMarketResponse(response);
}

export async function getMarketQuotes(symbols, { signal } = {}) {
  const symbolList = Array.isArray(symbols) ? symbols.join(',') : String(symbols || '');
  const response = await fetch(
    buildApiUrl(`/market/quotes?symbols=${encodeURIComponent(symbolList)}`),
    {
      headers: await buildAuthHeaders(),
      credentials: 'include',
      signal,
    }
  );
  return parseMarketResponse(response);
}

export async function getMarketSparklines(symbols, { range = '1M', signal } = {}) {
  const symbolList = Array.isArray(symbols) ? symbols.join(',') : String(symbols || '');
  const params = new URLSearchParams({
    symbols: symbolList,
    range,
  });
  const response = await fetch(buildApiUrl(`/market/sparklines?${params.toString()}`), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
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
