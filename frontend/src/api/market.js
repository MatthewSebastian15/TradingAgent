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

export async function searchMarketTickers(
  query,
  { limit = 10, market = 'ALL', type = 'ALL', signal } = {}
) {
  const params = new URLSearchParams({
    q: String(query || ''),
    limit: String(limit),
    market: String(market || 'ALL'),
    type: String(type || 'ALL'),
  });
  const response = await fetch(buildApiUrl(`/market/search?${params.toString()}`), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
  return parseMarketResponse(response);
}

export async function getMarketSearchWarmup({ signal } = {}) {
  const response = await fetch(buildApiUrl('/market/search/warmup'), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
  return parseMarketResponse(response);
}

export async function getMarketOhlcv(ticker, { range = '1Y', tradeDate, signal } = {}) {
  const params = new URLSearchParams({ ticker: String(ticker || ''), range: String(range) });
  if (tradeDate) params.set('trade_date', String(tradeDate));
  const response = await fetch(buildApiUrl(`/market/ohlcv?${params.toString()}`), {
    headers: await buildAuthHeaders(),
    credentials: 'include',
    signal,
  });
  return parseMarketResponse(response);
}

// Backend runtime config (used by the Quant tab for the risk-free rate).
export async function getApiStatus({ signal } = {}) {
  const response = await fetch(buildApiUrl('/status'), {
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

export async function getMarketOverview(symbols, { signal, forceRefresh = false } = {}) {
  const params = new URLSearchParams();
  if (forceRefresh) {
    params.set('force_refresh', 'true');
    params.set('_ts', String(Date.now()));
  }
  const query = params.toString();
  const response = await fetch(buildApiUrl(`/market/overview${query ? `?${query}` : ''}`), {
    method: 'POST',
    headers: await buildHeaders(),
    credentials: 'include',
    body: JSON.stringify({ symbols }),
    signal,
    cache: forceRefresh ? 'no-store' : 'default',
  });
  return parseMarketResponse(response);
}

export async function getStockOverview(ticker, { signal } = {}) {
  const response = await fetch(
    buildApiUrl(`/market/stock-overview?ticker=${encodeURIComponent(ticker)}`),
    {
      headers: await buildAuthHeaders(),
      credentials: 'include',
      signal,
    }
  );
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
