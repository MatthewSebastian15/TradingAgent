import {
  normalizeHolding,
  readHoldings,
  readHoldingsDetailed,
  clearHoldings,
  mergeHoldings,
  replaceHoldings,
} from './holdingsStore';
import {
  normalizeTrackedRecord,
  readTracked,
  readTrackedDetailed,
  clearTracked,
  mergeTracked,
  replaceTracked,
} from './portfolioStore';

export const BACKUP_KIND = 'portfolio-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 1_000_000;
export const MAX_BACKUP_ROWS = 2000;

export function buildBackup({ holdings, tracked }, now = new Date()) {
  return {
    app: 'tradingagent',
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    holdings,
    tracked,
  };
}

export function backupFilename(now = new Date()) {
  return `portfolio-backup-${now.toISOString().slice(0, 10)}.json`;
}

function cleanList(raw, normalize) {
  const rows = Array.isArray(raw) ? raw : [];
  const clean = rows.map(normalize).filter(Boolean);
  return { clean, skipped: rows.length - clean.length };
}

// Validates untrusted text. Never throws.
export function parseBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The file is empty.' };
  if (text.length > MAX_BACKUP_BYTES)
    return { ok: false, error: 'The file is too large (limit 1 MB).' };

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (data?.kind !== BACKUP_KIND)
    return { ok: false, error: 'This is not a portfolio backup file.' };
  if (data.version !== BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version ${String(data.version)}.` };
  }
  if (!Array.isArray(data.holdings) && !Array.isArray(data.tracked)) {
    return { ok: false, error: 'The backup has no holdings or tracked positions.' };
  }
  if (
    (data.holdings?.length || 0) > MAX_BACKUP_ROWS ||
    (data.tracked?.length || 0) > MAX_BACKUP_ROWS
  ) {
    return { ok: false, error: 'The backup has too many rows.' };
  }

  const holdings = cleanList(data.holdings, normalizeHolding);
  const tracked = cleanList(data.tracked, normalizeTrackedRecord);
  return {
    ok: true,
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
    holdings: holdings.clean,
    tracked: tracked.clean,
    skipped: holdings.skipped + tracked.skipped,
  };
}

export async function exportBackup(now = new Date()) {
  const [holdings, tracked] = await Promise.all([readHoldings(), readTracked()]);
  return {
    filename: backupFilename(now),
    text: JSON.stringify(buildBackup({ holdings, tracked }, now), null, 2),
  };
}

const isBlocked = (status) => status === 'unreadable' || status === 'corrupt';

// mode: 'merge' | 'replace'. Replace also recovers an unreadable store (clear, then write).
export async function importBackup(parsed, mode) {
  if (mode === 'replace') {
    if (isBlocked((await readHoldingsDetailed()).status)) await clearHoldings();
    if (isBlocked((await readTrackedDetailed()).status)) await clearTracked();
  }

  const holdings = await (mode === 'replace' ? replaceHoldings : mergeHoldings)(parsed.holdings);
  if (!holdings.ok) return { ok: false, reason: holdings.reason, partial: false };

  const tracked = await (mode === 'replace' ? replaceTracked : mergeTracked)(parsed.tracked);
  if (!tracked.ok) return { ok: false, reason: tracked.reason, partial: true };

  return { ok: true, holdings: parsed.holdings.length, tracked: parsed.tracked.length };
}

// ---- CSV (holdings only) -------------------------------------------------------------

const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`; // neutralize spreadsheet formulas
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function holdingsToCsv(holdings) {
  const header = ['ticker', 'shares', 'avg_cost', 'added_at'];
  const rows = holdings.map((lot) => [lot.ticker, lot.shares, lot.cost_basis, lot.added_at]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
