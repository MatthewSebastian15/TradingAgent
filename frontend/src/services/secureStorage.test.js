import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { decryptJSON, encryptJSON } from './secureStorage';

beforeAll(() => {
  // jsdom's `crypto` is a read-only getter without a usable `subtle`; node's
  // native WebCrypto produces CryptoKeys that survive fake-indexeddb's
  // structured clone (the @peculiar polyfill's do not).
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

describe('secureStorage', () => {
  it('round-trips an object', async () => {
    const blob = await encryptJSON({ a: 1, b: ['x'] });
    expect(await decryptJSON(blob)).toEqual({ a: 1, b: ['x'] });
  });
  it('returns null on tampered ciphertext', async () => {
    const blob = JSON.parse(await encryptJSON({ a: 1 }));
    blob.ct = blob.ct.slice(0, -2) + 'AA';
    expect(await decryptJSON(JSON.stringify(blob))).toBeNull();
  });
  it('returns null on garbage / legacy plaintext', async () => {
    expect(await decryptJSON('[1,2,3]')).toBeNull();
    expect(await decryptJSON(null)).toBeNull();
  });
});
