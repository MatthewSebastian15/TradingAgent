import { beforeEach, describe, expect, it, vi } from 'vitest';

// Passthrough "encryption" so tests exercise persistence logic, not crypto.
vi.mock('./secureStorage', () => ({
  encryptJSON: async (value) => JSON.stringify(value),
  decryptJSON: async (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
}));

import { addHolding, readHoldings, removeHolding } from './holdingsStore';

beforeEach(() => {
  localStorage.clear();
});

describe('holdingsStore', () => {
  it('adds and reads a normalized holding', async () => {
    await addHolding({ ticker: ' aapl ', shares: 10, cost_basis: 150.5 });

    const holdings = await readHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      id: 'AAPL',
      ticker: 'AAPL',
      shares: 10,
      cost_basis: 150.5,
    });
    expect(holdings[0].added_at).toBeTruthy();
  });

  it('re-adding the same ticker overwrites the existing lot', async () => {
    await addHolding({ ticker: 'AAPL', shares: 10, cost_basis: 100 });
    await addHolding({ ticker: 'AAPL', shares: 5, cost_basis: 200 });

    const holdings = await readHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0].shares).toBe(5);
  });

  it('rejects invalid entries silently', async () => {
    await addHolding({ ticker: '', shares: 10, cost_basis: 100 });
    await addHolding({ ticker: 'X', shares: 0, cost_basis: 100 });
    await addHolding({ ticker: 'X', shares: -1, cost_basis: 100 });
    await addHolding({ ticker: 'X', shares: 1, cost_basis: -5 });
    expect(await readHoldings()).toEqual([]);
  });

  it('removes a holding by id and clears storage when empty', async () => {
    await addHolding({ ticker: 'AAPL', shares: 1, cost_basis: 1 });
    await addHolding({ ticker: 'MSFT', shares: 2, cost_basis: 2 });

    await removeHolding('AAPL');
    expect((await readHoldings()).map((h) => h.id)).toEqual(['MSFT']);

    await removeHolding('MSFT');
    expect(await readHoldings()).toEqual([]);
    expect(localStorage.getItem('portfolio_holdings_v1')).toBeNull();
  });

  it('returns [] on corrupt storage', async () => {
    localStorage.setItem('portfolio_holdings_v1', '{corrupt');
    expect(await readHoldings()).toEqual([]);
  });

  it('serializes concurrent writes without losing entries', async () => {
    await Promise.all([
      addHolding({ ticker: 'AAPL', shares: 1, cost_basis: 1 }),
      addHolding({ ticker: 'MSFT', shares: 2, cost_basis: 2 }),
      addHolding({ ticker: 'GOOG', shares: 3, cost_basis: 3 }),
    ]);
    expect(await readHoldings()).toHaveLength(3);
  });
});
