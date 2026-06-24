import { decryptJSON, encryptJSON } from './secureStorage';

// Tracked AI recommendations the user has promoted from the signals feed.
// Encrypted at rest with the same device key as the watchlist/history stores.
const STORAGE_KEY = 'portfolio_tracked_v1';
const SCHEMA_VERSION = 1;

// Serialize read-modify-write so concurrent track/untrack calls can't clobber
// each other (encryption makes them async). Mirrors useAnalysisHistoryStore.
let writeChain = Promise.resolve();
function enqueueWrite(task) {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalize(entry) {
  const id = textOrNull(entry?.id);
  const ticker = textOrNull(entry?.ticker)?.toUpperCase() || null;
  const entryPrice = Number(entry?.entry_price);
  if (!id || !ticker || !Number.isFinite(entryPrice)) return null;

  const horizon = Number(entry.time_horizon_months);

  return {
    schema_version: SCHEMA_VERSION,
    id,
    ticker,
    market: textOrNull(entry.market),
    decision: textOrNull(entry.decision),
    display_signal: textOrNull(entry.display_signal),
    confidence_score: numberOrNull(entry.confidence_score),
    confidence_tier: textOrNull(entry.confidence_tier),
    time_horizon_months: [1, 2, 3].includes(horizon) ? horizon : null,
    entry_price: entryPrice,
    entry_at: textOrNull(entry.entry_at) || new Date().toISOString(),
    analysis_created_at: textOrNull(entry.analysis_created_at),
    trade_date: textOrNull(entry.trade_date),
  };
}

export async function readTracked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = await decryptJSON(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeTracked(entries) {
  const clean = entries.map(normalize).filter(Boolean);
  try {
    if (clean.length) {
      localStorage.setItem(STORAGE_KEY, await encryptJSON(clean));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore unavailable or restricted localStorage.
  }
}

export function addTracked(record) {
  return enqueueWrite(async () => {
    const next = normalize(record);
    if (!next) return;
    const current = await readTracked();
    await writeTracked([next, ...current.filter((entry) => entry.id !== next.id)]);
  });
}

export function removeTracked(id) {
  return enqueueWrite(async () => {
    const current = await readTracked();
    await writeTracked(current.filter((entry) => entry.id !== id));
  });
}

export function clearTracked() {
  return enqueueWrite(async () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore unavailable or restricted localStorage.
    }
  });
}
