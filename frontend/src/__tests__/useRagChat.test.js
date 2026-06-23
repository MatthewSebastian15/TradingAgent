import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/ragChat.js', () => ({
  fetchRagChat: vi.fn(),
  fetchPoolStatus: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../services/watchlistStorage', () => ({
  readWatchlistState: vi.fn(() => ({ groups: [] })),
}));

describe('useRagChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  });

  it('starts with empty messages', async () => {
    const { useRagChat } = await import('../hooks/useRagChat.js');
    const { result } = renderHook(() => useRagChat('all'));
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('sendMessage adds user + assistant messages', async () => {
    const { fetchRagChat } = await import('../api/ragChat.js');
    fetchRagChat.mockResolvedValueOnce({
      answer: 'Tesla Q2 baik.',
      out_of_scope: false,
      pool_used: ['news'],
      sources: [],
    });

    const { useRagChat } = await import('../hooks/useRagChat.js');
    const { result } = renderHook(() => useRagChat('all'));

    await act(async () => {
      await result.current.sendMessage('Berita Tesla?');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[1].role).toBe('assistant');
    expect(result.current.messages[1].content).toBe('Tesla Q2 baik.');
  });

  it('clearMessages empties the list', async () => {
    const { fetchRagChat } = await import('../api/ragChat.js');
    fetchRagChat.mockResolvedValueOnce({
      answer: 'OK',
      out_of_scope: false,
      pool_used: [],
      sources: [],
    });

    const { useRagChat } = await import('../hooks/useRagChat.js');
    const { result } = renderHook(() => useRagChat('all'));

    await act(async () => {
      await result.current.sendMessage('test');
    });

    act(() => result.current.clearMessages());
    expect(result.current.messages).toEqual([]);
  });
});
