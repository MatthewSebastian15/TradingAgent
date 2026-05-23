const API_URL = import.meta.env.VITE_API_URL || '';
const BROWSER_API_KEY_ENABLED = import.meta.env.VITE_ENABLE_BROWSER_API_KEY === 'true';
const API_KEY = BROWSER_API_KEY_ENABLED ? (import.meta.env.VITE_API_KEY || '') : '';

if (import.meta.env.VITE_API_KEY && !BROWSER_API_KEY_ENABLED) {
  console.warn('VITE_API_KEY is not sent unless VITE_ENABLE_BROWSER_API_KEY=true.');
}

export function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = API_URL.trim().replace(/\/+$/, '');
  if (!base) return `/api${cleanPath}`;
  const cleanBase = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${cleanBase}/api${cleanPath}`;
}

export function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  return headers;
}

export function buildAuthHeaders() {
  return API_KEY ? { 'x-api-key': API_KEY } : {};
}

export async function readHttpError(res) {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return json.error?.message || json.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}: ${text || res.statusText}`;
  }
}
