import { describe, expect, it } from 'vitest';

import { resolveFrontendConfig } from './config';

describe('resolveFrontendConfig', () => {
  it('falls back to defaults when env vars are absent', () => {
    expect(resolveFrontendConfig({})).toEqual({ apiBaseUrl: '/api', apiUrl: '' });
  });

  it('reads and trims the vite env values', () => {
    expect(
      resolveFrontendConfig({
        VITE_API_BASE_URL: ' /api/v2 ',
        VITE_API_URL: ' http://localhost:8000 ',
      })
    ).toEqual({ apiBaseUrl: '/api/v2', apiUrl: 'http://localhost:8000' });
  });

  it('ignores non-string values', () => {
    expect(resolveFrontendConfig({ VITE_API_BASE_URL: 42, VITE_API_URL: null })).toEqual({
      apiBaseUrl: '/api',
      apiUrl: '',
    });
  });
});
