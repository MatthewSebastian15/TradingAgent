import { describe, expect, it } from 'vitest';

import { MAX_CONVERSATIONS, pruneConversations } from './chatHistory';

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

describe('pruneConversations', () => {
  it('drops conversations older than the TTL', () => {
    const fresh = { id: 'a', updatedAt: iso(Date.now() - DAY) };
    const stale = { id: 'b', updatedAt: iso(Date.now() - 31 * DAY) };
    expect(pruneConversations([fresh, stale])).toEqual([fresh]);
  });

  it('keeps undated conversations (best-effort, never silently dropped)', () => {
    const undated = { id: 'c' };
    expect(pruneConversations([undated])).toEqual([undated]);
  });

  it('caps the count, keeping the newest-first head', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i), updatedAt: iso(Date.now()) }));
    const pruned = pruneConversations(many);
    expect(pruned).toHaveLength(MAX_CONVERSATIONS);
    expect(pruned[0].id).toBe('0');
  });

  it('tolerates non-array input', () => {
    expect(pruneConversations(null)).toEqual([]);
  });
});
