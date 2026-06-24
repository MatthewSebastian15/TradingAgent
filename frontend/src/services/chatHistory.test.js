import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CHAT_HISTORY_KEY,
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
