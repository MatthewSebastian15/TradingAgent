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

import {
  addHolding,
  clearHoldings,
  readHoldings,
  readHoldingsDetailed,
  removeHolding,
  updateHolding,
} from './holdingsStore';

beforeEach(() => {
  localStorage.clear();
});

describe('holdingsStore', () => {
  it('adds and reads a normalized holding', async () => {
    await addHolding({ ticker: ' aapl ', shares: 10, cost_basis: 150.5 });

    const holdings = await readHoldings();
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      ticker: 'AAPL',
      shares: 10,
      cost_basis: 150.5,
    });
    expect(holdings[0].id).toBeTruthy();
    expect(holdings[0].added_at).toBeTruthy();
  });

  it('re-adding the same ticker creates a second lot', async () => {
    await addHolding({ ticker: 'AAPL', shares: 10, cost_basis: 100 });
    await addHolding({ ticker: 'AAPL', shares: 5, cost_basis: 200 });

    const holdings = await readHoldings();
    expect(holdings).toHaveLength(2);
    expect(holdings[0].id).not.toBe(holdings[1].id);
    expect(holdings.map((h) => h.shares).sort()).toEqual([10, 5].sort());
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

    const [msft, aapl] = await readHoldings();
    await removeHolding(aapl.id);
    expect((await readHoldings()).map((h) => h.ticker)).toEqual(['MSFT']);

    await removeHolding(msft.id);
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

  it('add and remove resolve to typed results', async () => {
    expect(await addHolding({ ticker: 'AAPL', shares: 1, cost_basis: 1 })).toEqual({ ok: true });
    expect(await addHolding({ ticker: '', shares: 1, cost_basis: 1 })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('never overwrites or deletes an unreadable blob', async () => {
    const envelope = JSON.stringify({ v: 1, iv: 'aaa', ct: 'bbb' });
    localStorage.setItem('portfolio_holdings_v1', envelope);

    expect((await readHoldingsDetailed()).status).toBe('unreadable');
    expect(await addHolding({ ticker: 'AAPL', shares: 1, cost_basis: 1 })).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(await removeHolding('anything')).toEqual({ ok: false, reason: 'unreadable' });
    expect(localStorage.getItem('portfolio_holdings_v1')).toBe(envelope);
    expect(localStorage.getItem('portfolio_holdings_v1:unreadable')).toBe(envelope);
  });

  it('clearHoldings starts fresh so adds work again', async () => {
    localStorage.setItem('portfolio_holdings_v1', JSON.stringify({ v: 1, iv: 'a', ct: 'b' }));
    await clearHoldings();

    expect(await addHolding({ ticker: 'AAPL', shares: 1, cost_basis: 1 })).toEqual({ ok: true });
    expect(await readHoldings()).toHaveLength(1);
  });

  it('add is idempotent by id so an undo restores the exact lot', async () => {
    await addHolding({ ticker: 'AAPL', shares: 10, cost_basis: 100 });
    const [lot] = await readHoldings();

    await removeHolding(lot.id);
    expect(await readHoldings()).toEqual([]);

    await addHolding(lot);
    await addHolding(lot); // double restore must not duplicate
    const restored = await readHoldings();
    expect(restored).toEqual([lot]);
    expect(restored[0].added_at).toBe(lot.added_at);
  });

  it('refuses to exceed the lot cap', async () => {
    const lots = Array.from({ length: 500 }, (_, i) => ({
      schema_version: 1,
      id: `id-${i}`,
      ticker: 'AAPL',
      shares: 1,
      cost_basis: 1,
      added_at: '2026-01-01T00:00:00.000Z',
    }));
    localStorage.setItem('portfolio_holdings_v1', JSON.stringify(lots));

    expect(await addHolding({ ticker: 'MSFT', shares: 1, cost_basis: 1 })).toEqual({
      ok: false,
      reason: 'limit',
    });
    expect(await readHoldings()).toHaveLength(500);
  });

  describe('updateHolding', () => {
    it('edits shares, cost and ticker in place, keeping id, date and position', async () => {
      await addHolding({ ticker: 'AAPL', shares: 10, cost_basis: 100 });
      await addHolding({ ticker: 'MSFT', shares: 1, cost_basis: 1 });
      const [msft, aapl] = await readHoldings();

      expect(
        await updateHolding(aapl.id, { shares: 12, cost_basis: 95, ticker: 'aapl.us' })
      ).toEqual({ ok: true });

      const after = await readHoldings();
      expect(after.map((lot) => lot.id)).toEqual([msft.id, aapl.id]); // order unchanged
      expect(after[1]).toMatchObject({ ticker: 'AAPL.US', shares: 12, cost_basis: 95 });
      expect(after[1].added_at).toBe(aapl.added_at);
    });

    it('ignores fields that are not editable', async () => {
      await addHolding({ ticker: 'AAPL', shares: 10, cost_basis: 100 });
      const [lot] = await readHoldings();

      await updateHolding(lot.id, { id: 'hijack', added_at: '1999-01-01', shares: 11 });

      const [after] = await readHoldings();
      expect(after.id).toBe(lot.id);
      expect(after.added_at).toBe(lot.added_at);
      expect(after.shares).toBe(11);
    });

    it('reports not_found and invalid without writing', async () => {
      await addHolding({ ticker: 'AAPL', shares: 10, cost_basis: 100 });
      const [lot] = await readHoldings();

      expect(await updateHolding('missing', { shares: 1 })).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(await updateHolding(lot.id, { shares: -4 })).toEqual({
        ok: false,
        reason: 'invalid',
      });
      expect((await readHoldings())[0].shares).toBe(10);
    });
  });
});
