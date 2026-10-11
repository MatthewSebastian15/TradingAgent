import { beforeEach, describe, expect, it, vi } from 'vitest';

const decryptMock = vi.hoisted(() => vi.fn());
vi.mock('./secureStorage', () => ({
  encryptJSON: async (value) => JSON.stringify(value),
  decryptJSON: decryptMock,
}));

import {
  createEncryptedListStore,
  STORAGE_ERROR_EVENT,
  STORAGE_UPDATED_EVENT,
} from './encryptedListStore';

const KEY = 'test_list_v1';
const BACKUP = `${KEY}:unreadable`;
const ENVELOPE = JSON.stringify({ v: 1, iv: 'aaa', ct: 'bbb' });
const normalize = (entry) => (entry && typeof entry.id === 'string' ? { id: entry.id } : null);
const add = (id) => (current) => [{ id }, ...current];

let store;

beforeEach(() => {
  localStorage.clear();
  store = createEncryptedListStore({ key: KEY, normalize });
  decryptMock.mockReset();
  decryptMock.mockImplementation(async (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
});

describe('encryptedListStore', () => {
  it('reports empty, then ok after a write, and clears the key when emptied', async () => {
    expect(await store.readDetailed()).toEqual({ items: [], status: 'empty' });

    expect(await store.mutate(add('a'))).toEqual({ ok: true });
    expect(await store.readDetailed()).toEqual({ items: [{ id: 'a' }], status: 'ok' });

    await store.mutate(() => []);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('serializes concurrent mutations without losing entries', async () => {
    await Promise.all([store.mutate(add('a')), store.mutate(add('b')), store.mutate(add('c'))]);
    expect((await store.readDetailed()).items).toHaveLength(3);
  });

  it('refuses to write over an unreadable blob and keeps it plus a backup', async () => {
    localStorage.setItem(KEY, ENVELOPE);
    decryptMock.mockResolvedValue(null);

    expect((await store.readDetailed()).status).toBe('unreadable');
    expect(await store.mutate(add('a'))).toEqual({ ok: false, reason: 'unreadable' });
    expect(await store.mutate(() => [])).toEqual({ ok: false, reason: 'unreadable' });
    expect(localStorage.getItem(KEY)).toBe(ENVELOPE);
    expect(localStorage.getItem(BACKUP)).toBe(ENVELOPE);
  });

  it('keeps the first backup and never overwrites it', async () => {
    decryptMock.mockResolvedValue(null);
    localStorage.setItem(KEY, ENVELOPE);
    await store.readDetailed();

    localStorage.setItem(KEY, JSON.stringify({ v: 1, iv: 'x', ct: 'y' }));
    await store.readDetailed();

    expect(localStorage.getItem(BACKUP)).toBe(ENVELOPE);
  });

  it('classifies non-envelope garbage as corrupt', async () => {
    localStorage.setItem(KEY, '{corrupt');
    decryptMock.mockResolvedValue(null);
    expect(await store.readDetailed()).toEqual({ items: [], status: 'corrupt' });
  });

  it('drops the redundant backup once the blob becomes readable again', async () => {
    const raw = JSON.stringify([{ id: 'a' }]);
    localStorage.setItem(KEY, raw);
    decryptMock.mockResolvedValueOnce(null); // transient failure

    expect((await store.readDetailed()).status).toBe('corrupt');
    expect(localStorage.getItem(BACKUP)).toBe(raw);

    expect((await store.readDetailed()).status).toBe('ok');
    expect(localStorage.getItem(BACKUP)).toBeNull();
  });

  it('clear() starts fresh, keeps the backup and unblocks writes', async () => {
    localStorage.setItem(KEY, ENVELOPE);
    decryptMock.mockResolvedValue(null);
    await store.readDetailed();

    expect(await store.clear()).toEqual({ ok: true });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(BACKUP)).toBe(ENVELOPE);

    decryptMock.mockImplementation(async (raw) => JSON.parse(raw));
    expect(await store.mutate(add('a'))).toEqual({ ok: true });
  });

  it('reports invalid input without writing', async () => {
    expect(await store.mutate(() => null)).toEqual({ ok: false, reason: 'invalid' });
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('reports a failed write and emits a storage-error event', async () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_ERROR_EVENT, listener);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    expect(await store.mutate(add('a'))).toEqual({ ok: false, reason: 'write_failed' });
    expect(listener.mock.calls[0][0].detail).toEqual({
      key: KEY,
      name: 'QuotaExceededError',
      quota: true,
    });

    spy.mockRestore();
    window.removeEventListener(STORAGE_ERROR_EVENT, listener);
  });

  it('emits an updated event only after a successful write', async () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_UPDATED_EVENT, listener);

    await store.mutate(add('a'));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ key: KEY });
    window.removeEventListener(STORAGE_UPDATED_EVENT, listener);
  });
});
