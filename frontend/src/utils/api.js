const API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '';
const OWNER_TOKEN_KEY = '_ta_owner_token';
const OWNER_TOKEN_EXPIRES_AT_KEY = '_ta_owner_token_expires_at';
const OWNER_TOKEN_REFRESH_SKEW_SECONDS = 30;

let ownerTokenPromise = null;

export function buildApiUrl(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = API_URL.trim().replace(/\/+$/, '');
  if (!base) return `/api${cleanPath}`;
  const cleanBase = base.endsWith('/api') ? base.slice(0, -4) : base;
  return `${cleanBase}/api${cleanPath}`;
}

function readStoredOwnerToken() {
  const token = sessionStorage.getItem(OWNER_TOKEN_KEY);
  const expiresAt = Number(sessionStorage.getItem(OWNER_TOKEN_EXPIRES_AT_KEY));
  const now = Math.floor(Date.now() / 1000);

  if (!token) return null;
  if (Number.isFinite(expiresAt) && expiresAt > now + OWNER_TOKEN_REFRESH_SKEW_SECONDS) {
    return token;
  }

  sessionStorage.removeItem(OWNER_TOKEN_KEY);
  sessionStorage.removeItem(OWNER_TOKEN_EXPIRES_AT_KEY);
  return null;
}

async function bootstrapOwnerToken() {
  const response = await fetch(buildApiUrl('/session'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) throw new Error(await readHttpError(response));

  const session = await response.json();
  if (!session.owner_token || !session.expires_at) {
    throw new Error('Backend owner session response is invalid.');
  }

  sessionStorage.setItem(OWNER_TOKEN_KEY, session.owner_token);
  sessionStorage.setItem(OWNER_TOKEN_EXPIRES_AT_KEY, String(session.expires_at));
  return session.owner_token;
}

export async function getOwnerToken() {
  const storedToken = readStoredOwnerToken();
  if (storedToken) return storedToken;

  if (!ownerTokenPromise) {
    ownerTokenPromise = bootstrapOwnerToken().finally(() => {
      ownerTokenPromise = null;
    });
  }
  return ownerTokenPromise;
}

export async function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(await buildAuthHeaders()),
  };
}

export async function buildAuthHeaders() {
  return {
    'x-owner-token': await getOwnerToken(),
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
