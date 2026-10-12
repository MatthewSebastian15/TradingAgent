import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { addHolding, readHoldings } from './holdingsStore';
import {
  backupFilename,
  buildBackup,
  exportBackup,
  holdingsToCsv,
  importBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
} from './portfolioBackup';
import { addTracked, closeTracked, readTracked } from './portfolioStore';

const tracked = {
  id: 'job-1',
  ticker: 'AAPL',
  decision: 'BUY',
  entry_price: 150,
  stop_loss: 140,
  take_profit: 170,
};

beforeEach(() => {
  localStorage.clear();
});

describe('backup document', () => {
  it('builds a versioned document and a date-only filename', () => {
    const now = new Date('2026-10-09T10:00:00.000Z');
    expect(buildBackup({ holdings: [], tracked: [] }, now)).toEqual({
      app: 'tradingagent',
      kind: 'portfolio-backup',
      version: 1,
      exportedAt: '2026-10-09T10:00:00.000Z',
      holdings: [],
      tracked: [],
    });
    expect(backupFilename(now)).toBe('portfolio-backup-2026-10-09.json');
  });
});

describe('parseBackup', () => {
  const doc = (extra = {}) =>
    JSON.stringify({ kind: 'portfolio-backup', version: 1, holdings: [], tracked: [], ...extra });

  it('rejects empty, oversized, non-JSON, foreign and unsupported files', () => {
    expect(parseBackup('').ok).toBe(false);
    expect(parseBackup(' '.repeat(10)).ok).toBe(false);
    expect(parseBackup('x'.repeat(MAX_BACKUP_BYTES + 1)).error).toMatch(/too large/);
    expect(parseBackup('{nope').error).toMatch(/not valid JSON/);
    expect(parseBackup(JSON.stringify({ kind: 'other', version: 1 })).error).toMatch(
      /not a portfolio backup/
    );
    expect(parseBackup(doc({ version: 2 })).error).toMatch(/Unsupported backup version 2/);
    expect(parseBackup(JSON.stringify({ kind: 'portfolio-backup', version: 1 })).error).toMatch(
      /no holdings or tracked/
    );
  });

  it('rejects too many rows', () => {
    const rows = Array.from({ length: 2001 }, (_, index) => ({
      id: `h${index}`,
      ticker: 'A',
      shares: 1,
      cost_basis: 1,
    }));
    expect(parseBackup(doc({ holdings: rows })).error).toMatch(/too many rows/);
  });

  it('normalizes rows and counts the skipped ones', () => {
    const result = parseBackup(
      doc({
        holdings: [
          { id: 'h1', ticker: ' aapl ', shares: 2, cost_basis: 10 },
          { id: 'h2', ticker: '', shares: 2, cost_basis: 10 },
        ],
        tracked: [{ ...tracked }, { id: '', ticker: 'X' }],
        exportedAt: '2026-10-09T00:00:00.000Z',
      })
    );

    expect(result.ok).toBe(true);
    expect(result.holdings.map((lot) => lot.ticker)).toEqual(['AAPL']);
    expect(result.tracked).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.exportedAt).toBe('2026-10-09T00:00:00.000Z');
  });
});

describe('export → import round trip', () => {
  async function seed() {
    await addHolding({ id: 'h1', ticker: 'AAPL', shares: 10, cost_basis: 150 });
    await addTracked(tracked);
    await closeTracked('job-1', 180);
  }

  it('restores exactly what was exported (replace)', async () => {
    await seed();
    const before = { holdings: await readHoldings(), tracked: await readTracked() };
    const { text } = await exportBackup();

    localStorage.clear();
    const parsed = parseBackup(text);
    expect(await importBackup(parsed, 'replace')).toEqual({ ok: true, holdings: 1, tracked: 1 });

    expect(await readHoldings()).toEqual(before.holdings);
    expect(await readTracked()).toEqual(before.tracked);
  });

  it('merge adds what is missing and keeps local state', async () => {
    await seed();
    const { text } = await exportBackup();
    await addHolding({ id: 'h2', ticker: 'MSFT', shares: 1, cost_basis: 1 });

    expect((await importBackup(parseBackup(text), 'merge')).ok).toBe(true);

    expect((await readHoldings()).map((lot) => lot.id).sort()).toEqual(['h1', 'h2']);
  });

  it('replace recovers a store whose blob is unreadable, merge refuses', async () => {
    await seed();
    const { text } = await exportBackup();
    localStorage.setItem('portfolio_holdings_v1', JSON.stringify({ v: 1, iv: 'a', ct: 'b' }));

    expect(await importBackup(parseBackup(text), 'merge')).toMatchObject({
      ok: false,
      reason: 'unreadable',
    });
    expect(await importBackup(parseBackup(text), 'replace')).toMatchObject({ ok: true });
    expect((await readHoldings()).map((lot) => lot.id)).toEqual(['h1']);
  });

  it('reports a partial failure when tracked cannot be written after holdings', async () => {
    const parsed = {
      holdings: [
        {
          id: 'h1',
          ticker: 'AAPL',
          shares: 1,
          cost_basis: 1,
          added_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      tracked: [],
    };
    localStorage.setItem('portfolio_tracked_v1', JSON.stringify({ v: 1, iv: 'a', ct: 'b' }));

    expect(await importBackup(parsed, 'merge')).toEqual({
      ok: false,
      reason: 'unreadable',
      partial: true,
    });
    expect(await readHoldings()).toHaveLength(1);
  });
});

describe('holdingsToCsv', () => {
  it('writes a header and one row per lot', () => {
    const csv = holdingsToCsv([
      { ticker: 'AAPL', shares: 10, cost_basis: 150.5, added_at: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(csv).toBe(
      'ticker,shares,avg_cost,added_at\r\nAAPL,10,150.5,2026-01-01T00:00:00.000Z\r\n'
    );
  });

  it('neutralizes spreadsheet formulas and quotes awkward cells', () => {
    const csv = holdingsToCsv([
      { ticker: '=HYPERLINK("http://evil")', shares: 1, cost_basis: 1, added_at: '+1' },
      { ticker: 'A,B', shares: 1, cost_basis: 1, added_at: '"q"' },
    ]);
    const lines = csv.trim().split('\r\n');

    expect(lines[1]).toBe('"\'=HYPERLINK(""http://evil"")",1,1,\'+1');
    expect(lines[2]).toBe('"A,B",1,1,"""q"""');
  });
});
