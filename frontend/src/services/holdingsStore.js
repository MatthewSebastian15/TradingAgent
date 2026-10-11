import { createEncryptedListStore } from './encryptedListStore';

// User-entered portfolio holdings (real positions they own). Encrypted at rest
// with the same device key as the watchlist/history/tracked stores.
export const HOLDINGS_STORAGE_KEY = 'portfolio_holdings_v1';
const SCHEMA_VERSION = 1;

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
    // Each add is its own lot; legacy entries (id == ticker) keep their id.
    id: textOrNull(entry?.id) || crypto.randomUUID(),
    ticker,
    shares,
    cost_basis: costBasis,
    added_at: textOrNull(entry.added_at) || new Date().toISOString(),
  };
}

const store = createEncryptedListStore({ key: HOLDINGS_STORAGE_KEY, normalize });

export const readHoldingsDetailed = () => store.readDetailed();

export async function readHoldings() {
  return (await store.readDetailed()).items;
}

export function addHolding(record) {
  return store.mutate((current) => {
    const next = normalize(record);
    return next ? [next, ...current] : null;
  });
}

export function removeHolding(id) {
  return store.mutate((current) => current.filter((entry) => entry.id !== id));
}

export const clearHoldings = () => store.clear();
