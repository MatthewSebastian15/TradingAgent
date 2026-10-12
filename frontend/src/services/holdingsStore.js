import { createEncryptedListStore } from './encryptedListStore';
import { MAX_LOTS } from '../utils/holdingsValidation';

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
    if (!next) return null;
    const without = current.filter((entry) => entry.id !== next.id); // idempotent: undo restores the exact lot
    if (without.length >= MAX_LOTS) return { reason: 'limit' };
    return [next, ...without];
  });
}

const EDITABLE = ['ticker', 'shares', 'cost_basis'];

export function updateHolding(id, patch) {
  return store.mutate((current) => {
    const index = current.findIndex((entry) => entry.id === id);
    if (index === -1) return { reason: 'not_found' };
    const changes = Object.fromEntries(
      EDITABLE.filter((key) => key in patch).map((key) => [key, patch[key]])
    );
    const merged = normalize({ ...current[index], ...changes }); // keeps id and added_at
    if (!merged) return null;
    return current.map((entry, position) => (position === index ? merged : entry));
  });
}

export function removeHolding(id) {
  return store.mutate((current) => current.filter((entry) => entry.id !== id));
}

export const normalizeHolding = normalize;

// Existing ids win: a local edit is never overwritten by an older backup.
export function mergeHoldings(items) {
  return store.mutate((current) => {
    const known = new Set(current.map((entry) => entry.id));
    const fresh = items.map(normalize).filter((entry) => entry && !known.has(entry.id));
    const next = [...fresh, ...current];
    return next.length > MAX_LOTS ? { reason: 'limit' } : next;
  });
}

export function replaceHoldings(items) {
  const next = items.map(normalize).filter(Boolean);
  return store.mutate(() => (next.length > MAX_LOTS ? { reason: 'limit' } : next));
}

export const clearHoldings = () => store.clear();
