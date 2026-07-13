import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_HISTORY_KEY,
  MAX_CONVERSATION_BYTES,
  MAX_CONVERSATIONS,
  loadConversations,
  pruneConversations,
} from './chatHistory';
import { encryptJSON } from './secureStorage';

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

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
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      updatedAt: iso(Date.now()),
    }));
    const pruned = pruneConversations(many);
    expect(pruned).toHaveLength(MAX_CONVERSATIONS);
    expect(pruned[0].id).toBe('0');
  });

  it('tolerates non-array input', () => {
    expect(pruneConversations(null)).toEqual([]);
  });

  it('caps a giant conversation by dropping its oldest messages', () => {
    const msg = (i) => ({ role: 'user', content: `${i}:${'x'.repeat(10_000)}` });
    const giant = {
      id: 'g',
      updatedAt: iso(Date.now()),
      messages: Array.from({ length: 40 }, (_, i) => msg(i)),
    };

    const [capped] = pruneConversations([giant]);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(MAX_CONVERSATION_BYTES);
    expect(capped.messages.length).toBeGreaterThan(0);
    // Newest messages survive; the dropped ones are the oldest.
    expect(capped.messages.at(-1)).toEqual(giant.messages.at(-1));
    expect(capped.messages[0]).not.toEqual(giant.messages[0]);
  });
});

describe('loadConversations (async dual-read)', () => {
  beforeEach(() => localStorage.clear());

  it('reads a legacy plaintext array', async () => {
    const convo = { id: 'a', title: 'x', messages: [], updatedAt: iso(Date.now()) };
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([convo]));
    expect(await loadConversations()).toEqual([convo]);
  });

  it('reads a freshly encrypted envelope', async () => {
    const convo = { id: 'b', title: 'y', messages: [], updatedAt: iso(Date.now()) };
    localStorage.setItem(CHAT_HISTORY_KEY, await encryptJSON([convo]));
    expect(await loadConversations()).toEqual([convo]);
  });

  it('returns [] when nothing stored', async () => {
    expect(await loadConversations()).toEqual([]);
  });
});
