import { frontendConfig } from '../config';

const OWNER_SESSION_EXPIRES_AT_KEY = '_ta_owner_session_expires_at';
const OWNER_SESSION_REFRESH_SKEW_SECONDS = 30;
const OWNER_SESSION_REQUEST_TIMEOUT_MS = 10000;

let ownerSessionPromise = null;
let ownerSessionExpiresAt = 0;

function resolveApiBaseUrl() {
  return (frontendConfig.apiBaseUrl || frontendConfig.apiUrl || '').trim();
}

export function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = resolveApiBaseUrl().replace(/\/+$/, '');
  if (!base) return `/api${cleanPath}`;
  const cleanBase = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${cleanBase}/api${cleanPath}`;
}

function storedOwnerSessionExpiresAt() {
  try {
    return Number(sessionStorage.getItem(OWNER_SESSION_EXPIRES_AT_KEY)) || 0;
  } catch {
    return 0;
  }
}

function hasFreshOwnerSession() {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.max(ownerSessionExpiresAt, storedOwnerSessionExpiresAt());
  return expiresAt > now + OWNER_SESSION_REFRESH_SKEW_SECONDS;
}

async function bootstrapOwnerSession() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), OWNER_SESSION_REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(buildApiUrl('/session'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Backend owner session request timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) throw new Error(await readHttpError(response));

  const session = await response.json();
  if (!session.expires_at) {
    throw new Error('Backend owner session response is invalid.');
  }

  ownerSessionExpiresAt = Number(session.expires_at) || 0;
  try {
    sessionStorage.setItem(OWNER_SESSION_EXPIRES_AT_KEY, String(ownerSessionExpiresAt));
  } catch {
    // Browser storage can be unavailable in private or locked-down contexts.
  }
}

export async function ensureOwnerSession() {
  if (hasFreshOwnerSession()) return;

  if (!ownerSessionPromise) {
    ownerSessionPromise = bootstrapOwnerSession().finally(() => {
      ownerSessionPromise = null;
    });
  }
  await ownerSessionPromise;
}

export async function buildHeaders() {
  await ensureOwnerSession();
  return {
    'Content-Type': 'application/json',
  };
}

export async function buildAuthHeaders() {
  await ensureOwnerSession();
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
