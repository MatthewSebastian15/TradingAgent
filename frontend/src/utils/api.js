const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const OWNER_SESSION_EXPIRES_AT_KEY = '_ta_owner_session_expires_at';
const OWNER_SESSION_REFRESH_SKEW_SECONDS = 30;

let ownerSessionPromise = null;
let ownerSessionExpiresAt = 0;

export function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = API_URL.trim().replace(/\/+$/, '');
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
  const response = await fetch(buildApiUrl('/session'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    credentials: 'include',
  });

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
