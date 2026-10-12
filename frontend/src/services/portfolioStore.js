import { createEncryptedListStore } from './encryptedListStore';
import { toPrice } from '../utils/price';

// Tracked AI recommendations the user has promoted from the signals feed.
// Encrypted at rest with the same device key as the watchlist/history stores.
export const TRACKED_STORAGE_KEY = 'portfolio_tracked_v1';
const SCHEMA_VERSION = 1;

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
  const closedAt = textOrNull(entry.closed_at);

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
    stop_loss: toPrice(entry.stop_loss),
    take_profit: toPrice(entry.take_profit),
    closed_at: closedAt,
    exit_price: closedAt ? toPrice(entry.exit_price) : null,
  };
}

const store = createEncryptedListStore({ key: TRACKED_STORAGE_KEY, normalize });

export const readTrackedDetailed = () => store.readDetailed();

export async function readTracked() {
  return (await store.readDetailed()).items;
}

export function addTracked(record) {
  return store.mutate((current) => {
    const next = normalize(record);
    return next ? [next, ...current.filter((entry) => entry.id !== next.id)] : null;
  });
}

export function removeTracked(id) {
  return store.mutate((current) => current.filter((entry) => entry.id !== id));
}

const EDITABLE = ['stop_loss', 'take_profit', 'closed_at', 'exit_price'];

export function updateTracked(id, patch) {
  return store.mutate((current) => {
    const index = current.findIndex((entry) => entry.id === id);
    if (index === -1) return { reason: 'not_found' };
    const changes = Object.fromEntries(
      EDITABLE.filter((key) => key in patch).map((key) => [key, patch[key]])
    );
    const merged = normalize({ ...current[index], ...changes });
    if (!merged) return null;
    return current.map((entry, position) => (position === index ? merged : entry));
  });
}

// Freezes the position at `exitPrice` (a live price chosen by the caller).
export function closeTracked(id, exitPrice) {
  if (toPrice(exitPrice) === null) return Promise.resolve({ ok: false, reason: 'invalid' });
  return updateTracked(id, { closed_at: new Date().toISOString(), exit_price: toPrice(exitPrice) });
}

export function reopenTracked(id) {
  return updateTracked(id, { closed_at: null, exit_price: null });
}

export const clearTracked = () => store.clear();
