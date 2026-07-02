import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  buildApiUrl: (path) => `/api${path}`,
}));

describe('fetchReportDisclaimer', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the disclaimer and caches the promise (single request)', async () => {
    const { fetchReportDisclaimer } = await import('./reportDisclaimer');
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ disclaimer: 'Research tool, not financial advice.' }),
    });

    const first = await fetchReportDisclaimer();
    const second = await fetchReportDisclaimer();

    expect(first).toBe('Research tool, not financial advice.');
    expect(second).toBe(first);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/reports/disclaimer',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('returns empty string on non-ok response', async () => {
    const { fetchReportDisclaimer } = await import('./reportDisclaimer');
    globalThis.fetch.mockResolvedValue({ ok: false });
    expect(await fetchReportDisclaimer()).toBe('');
  });

  it('returns empty string on network failure or bad payload', async () => {
    const { fetchReportDisclaimer } = await import('./reportDisclaimer');
    globalThis.fetch.mockRejectedValue(new Error('offline'));
    expect(await fetchReportDisclaimer()).toBe('');

    vi.resetModules();
    const { fetchReportDisclaimer: again } = await import('./reportDisclaimer');
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ disclaimer: 42 }) });
    expect(await again()).toBe('');
  });
});
