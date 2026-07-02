import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => `http://localhost:8000${path}`,
  buildHeaders: () => ({ 'Content-Type': 'application/json' }),
}));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('fetchRagChat', () => {
  it('posts message and returns answer', async () => {
    const { fetchRagChat } = await import('./ragChat.js');

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'Tesla Q2 kuat.',
        out_of_scope: false,
        pool_used: ['news'],
        sources: [],
      }),
    });

    const result = await fetchRagChat({
      message: 'Berita Tesla',
      contextFilter: 'news',
      chatHistory: [],
      watchlistContext: null,
    });

    expect(result.answer).toBe('Tesla Q2 kuat.');
    expect(result.pool_used).toEqual(['news']);
  });

  it('throws on non-ok response', async () => {
    const { fetchRagChat } = await import('./ragChat.js');

    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Server error' }),
    });

    await expect(
      fetchRagChat({
        message: 'test',
        contextFilter: 'all',
        chatHistory: [],
        watchlistContext: null,
      })
    ).rejects.toThrow();
  });
});
