const API_URL = import.meta.env.VITE_API_URL || '';

// Generate a stable session ID for this browser tab.
// This ensures POST /jobs and GET /jobs/{id}/events share the same
// client identifier in the backend rate limiter, so owner_id matches.
function getSessionId() {
  let id = sessionStorage.getItem('_ta_session_id');
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('_ta_session_id', id);
  }
  return id;
}

export function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = API_URL.trim().replace(/\/+$/, '');
  if (!base) return `/api${cleanPath}`;
  const cleanBase = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${cleanBase}/api${cleanPath}`;
}

export function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-session-id': getSessionId(),
  };
}

export function buildAuthHeaders() {
  return {
    'x-session-id': getSessionId(),
  };
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
