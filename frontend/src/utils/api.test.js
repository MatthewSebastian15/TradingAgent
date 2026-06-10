import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildAuthHeaders } from './api';

describe('owner session API', () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('bootstraps one HttpOnly owner session cookie per browser tab', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ owner_token: 'signed-owner-token', expires_at: expiresAt }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await buildAuthHeaders();
    const second = await buildAuthHeaders();

    expect(first).toEqual({});
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/session', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  });
});
