import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Deterministic pass-through "encryption" so the test exercises store logic, not crypto.
vi.mock('./secureStorage', () => ({
  encryptJSON: async (value) => JSON.stringify(value),
  decryptJSON: async (blob) => {
    try {
      return JSON.parse(blob);
    } catch {
      return null;
    }
  },
}));

import { addTracked, clearTracked, readTracked, removeTracked } from './portfolioStore';

const base = {
  id: 'job-1',
  ticker: 'aapl',
  decision: 'BUY',
  entry_price: 150,
  time_horizon_months: 3,
};

describe('portfolioStore', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.clearAllMocks());

  it('adds and reads a normalized record', async () => {
    await addTracked(base);
    const list = await readTracked();
    expect(list).toHaveLength(1);
    expect(list[0].ticker).toBe('AAPL'); // upper-cased
    expect(list[0].entry_price).toBe(150);
    expect(list[0].time_horizon_months).toBe(3);
  });

  it('dedupes by id, keeping the newest', async () => {
    await addTracked(base);
    await addTracked({ ...base, entry_price: 200 });
    const list = await readTracked();
    expect(list).toHaveLength(1);
    expect(list[0].entry_price).toBe(200);
  });

  it('drops records missing id, ticker, or price', async () => {
    await addTracked({ ...base, id: '' });
    await addTracked({ ...base, id: 'job-2', entry_price: 'nope' });
    expect(await readTracked()).toHaveLength(0);
  });

  it('removes by id and clears all', async () => {
    await addTracked(base);
    await addTracked({ ...base, id: 'job-2', ticker: 'MSFT' });
    await removeTracked('job-1');
    let list = await readTracked();
    expect(list.map((e) => e.id)).toEqual(['job-2']);

    await clearTracked();
    expect(await readTracked()).toHaveLength(0);
  });
});
