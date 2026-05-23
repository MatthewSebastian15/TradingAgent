const API_URL = import.meta.env.VITE_API_URL || '';

export function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = API_URL.trim().replace(/\/+$/, '');
  if (!base) return `/api${cleanPath}`;
  const cleanBase = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${cleanBase}/api${cleanPath}`;
}

export function buildHeaders() {
  return { 'Content-Type': 'application/json' };
}

export function buildAuthHeaders() {
  return {};
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
