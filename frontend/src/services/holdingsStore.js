import { decryptJSON, encryptJSON } from './secureStorage';

// User-entered portfolio holdings (real positions they own). Encrypted at rest
// with the same device key as the watchlist/history/tracked stores.
const STORAGE_KEY = 'portfolio_holdings_v1';
const SCHEMA_VERSION = 1;

// Serialize read-modify-write so concurrent add/remove calls can't clobber each
// other (encryption makes them async). Mirrors portfolioStore.
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

function normalize(entry) {
  const ticker = textOrNull(entry?.ticker)?.toUpperCase() || null;
  const shares = Number(entry?.shares);
  const costBasis = Number(entry?.cost_basis);
  if (!ticker || !Number.isFinite(shares) || shares <= 0) return null;
  if (!Number.isFinite(costBasis) || costBasis < 0) return null;

  return {
    schema_version: SCHEMA_VERSION,
    // ponytail: id == ticker, one lot per symbol. Re-adding a symbol overwrites.
    // Add lot-splitting (id = uuid) when a user asks to add to an existing
    // position instead of replacing it.
    id: ticker,
    ticker,
    shares,
    cost_basis: costBasis,
    added_at: textOrNull(entry.added_at) || new Date().toISOString(),
  };
}

export async function readHoldings() {
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

async function writeHoldings(entries) {
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

export function addHolding(record) {
  return enqueueWrite(async () => {
    const next = normalize(record);
    if (!next) return;
    const current = await readHoldings();
    await writeHoldings([next, ...current.filter((entry) => entry.id !== next.id)]);
  });
}

export function removeHolding(id) {
  return enqueueWrite(async () => {
    const current = await readHoldings();
    await writeHoldings(current.filter((entry) => entry.id !== id));
  });
}
