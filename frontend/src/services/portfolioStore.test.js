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

import {
  addTracked,
  clearTracked,
  closeTracked,
  mergeTracked,
  readTracked,
  readTrackedDetailed,
  removeTracked,
  reopenTracked,
  replaceTracked,
  updateTracked,
} from './portfolioStore';

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

  it('never overwrites or deletes an unreadable blob and reports why', async () => {
    const envelope = JSON.stringify({ v: 1, iv: 'aaa', ct: 'bbb' });
    localStorage.setItem('portfolio_tracked_v1', envelope);

    expect((await readTrackedDetailed()).status).toBe('unreadable');
    expect(await addTracked(base)).toEqual({ ok: false, reason: 'unreadable' });
    expect(await removeTracked('job-1')).toEqual({ ok: false, reason: 'unreadable' });
    expect(localStorage.getItem('portfolio_tracked_v1')).toBe(envelope);
    expect(localStorage.getItem('portfolio_tracked_v1:unreadable')).toBe(envelope);

    await clearTracked();
    expect(await addTracked(base)).toEqual({ ok: true });
  });

  it('stores optional stop-loss and take-profit and ignores invalid ones', async () => {
    await addTracked({ ...base, stop_loss: 140, take_profit: '170' });
    await addTracked({ ...base, id: 'job-2', stop_loss: 0, take_profit: 'nope' });

    const [second, first] = await readTracked();
    expect(first).toMatchObject({
      stop_loss: 140,
      take_profit: 170,
      closed_at: null,
      exit_price: null,
    });
    expect(second).toMatchObject({ stop_loss: null, take_profit: null });
  });

  it('closes a position at an exit price and can reopen it', async () => {
    await addTracked(base);

    expect(await closeTracked('job-1', 180)).toEqual({ ok: true });
    let [position] = await readTracked();
    expect(position.exit_price).toBe(180);
    expect(Date.parse(position.closed_at)).not.toBeNaN();

    expect(await reopenTracked('job-1')).toEqual({ ok: true });
    [position] = await readTracked();
    expect(position.closed_at).toBeNull();
    expect(position.exit_price).toBeNull();
  });

  it('refuses to close without a usable exit price and reports unknown ids', async () => {
    await addTracked(base);

    expect(await closeTracked('job-1', null)).toEqual({ ok: false, reason: 'invalid' });
    expect(await closeTracked('job-1', 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(await closeTracked('missing', 100)).toEqual({ ok: false, reason: 'not_found' });
    expect((await readTracked())[0].closed_at).toBeNull();
  });

  it('does not let a patch change identity fields', async () => {
    await addTracked(base);
    await updateTracked('job-1', { id: 'hijack', entry_price: 1, ticker: 'ZZZ', stop_loss: 120 });

    const [position] = await readTracked();
    expect(position).toMatchObject({
      id: 'job-1',
      ticker: 'AAPL',
      entry_price: 150,
      stop_loss: 120,
    });
  });
});

describe('merge / replace', () => {
  beforeEach(() => localStorage.clear());

  it('merge keeps local state for known ids (a locally closed position stays closed)', async () => {
    await addTracked(base);
    await closeTracked('job-1', 180);

    await mergeTracked([
      { ...base, entry_price: 1 },
      { ...base, id: 'job-2', ticker: 'MSFT' },
    ]);

    const byId = Object.fromEntries((await readTracked()).map((entry) => [entry.id, entry]));
    expect(byId['job-1'].closed_at).not.toBeNull();
    expect(byId['job-1'].entry_price).toBe(150);
    expect(byId['job-2'].ticker).toBe('MSFT');
  });

  it('replace swaps the tracked list', async () => {
    await addTracked(base);
    await replaceTracked([{ ...base, id: 'only', ticker: 'NVDA' }]);
    expect((await readTracked()).map((entry) => entry.id)).toEqual(['only']);
  });
});
