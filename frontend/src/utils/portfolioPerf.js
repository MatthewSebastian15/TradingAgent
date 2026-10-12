import { toPrice } from './price';

// Directional performance for tracked AI recommendations. A BUY profits when
// price rises; a SELL profits when it falls; HOLD/WAIT are neutral (price change
// shown, but excluded from win rate).

const LONG_DECISIONS = new Set(['BUY', 'OVERWEIGHT']);
const SHORT_DECISIONS = new Set(['SELL', 'UNDERWEIGHT', 'REDUCE']);

export function decisionDirection(decision) {
  const normalized = String(decision || '')
    .trim()
    .toUpperCase();
  if (LONG_DECISIONS.has(normalized)) return 1;
  if (SHORT_DECISIONS.has(normalized)) return -1;
  return 0;
}

export function isNeutral(decision) {
  return decisionDirection(decision) === 0;
}

// Signed return as a fraction (0.05 = +5%). null when prices are unusable.
export function returnPct(decision, entry, current) {
  const entryPrice = toPrice(entry);
  const currentPrice = toPrice(current);
  if (entryPrice === null || currentPrice === null) return null;
  const raw = (currentPrice - entryPrice) / entryPrice;
  const direction = decisionDirection(decision);
  return direction === 0 ? raw : raw * direction;
}

export const POSITION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  TARGET: 'TARGET_HIT',
  STOP: 'STOP_HIT',
  MATURED: 'MATURED',
  CLOSED: 'CLOSED',
});

// Levels on the wrong side of the entry (or on a neutral decision) are unusable.
export function usableLevels(decision, entry, stop, target) {
  const direction = decisionDirection(decision);
  const entryPrice = toPrice(entry);
  const stopPrice = toPrice(stop);
  const targetPrice = toPrice(target);
  if (direction === 0 || entryPrice === null) return { stop: null, target: null };
  const stopOk =
    stopPrice !== null && (direction > 0 ? stopPrice < entryPrice : stopPrice > entryPrice);
  const targetOk =
    targetPrice !== null && (direction > 0 ? targetPrice > entryPrice : targetPrice < entryPrice);
  return { stop: stopOk ? stopPrice : null, target: targetOk ? targetPrice : null };
}

// current: live price or null. Price events outrank maturity.
export function positionStatus(position, current) {
  if (position.closed_at) return POSITION_STATUS.CLOSED;
  const direction = decisionDirection(position.decision);
  const price = toPrice(current);
  const { stop, target } = usableLevels(
    position.decision,
    position.entry_price,
    position.stop_loss,
    position.take_profit
  );
  if (price !== null) {
    if (target !== null && (direction > 0 ? price >= target : price <= target)) {
      return POSITION_STATUS.TARGET;
    }
    if (stop !== null && (direction > 0 ? price <= stop : price >= stop)) {
      return POSITION_STATUS.STOP;
    }
  }
  return horizonInfo(position.entry_at, position.time_horizon_months).matured
    ? POSITION_STATUS.MATURED
    : POSITION_STATUS.OPEN;
}

// A closed position's return is frozen at its exit price.
export function positionReturn(position, current) {
  const price = position.closed_at ? position.exit_price : current;
  return returnPct(position.decision, position.entry_price, price);
}

// positions: [{ ticker, decision, entry_price, ... }]; priceFor: (ticker) => number.
export function summarize(positions, priceFor) {
  let valued = 0;
  let directional = 0;
  let wins = 0;
  let sumReturn = 0;
  let best = null;
  let worst = null;
  let openCount = 0;
  let closedCount = 0;
  let targetHits = 0;
  let stopHits = 0;

  for (const position of positions) {
    const current = priceFor(position.ticker);
    const status = positionStatus(position, current);
    if (status === POSITION_STATUS.CLOSED) closedCount += 1;
    else openCount += 1;
    if (status === POSITION_STATUS.TARGET) targetHits += 1;
    if (status === POSITION_STATUS.STOP) stopHits += 1;

    const ret = positionReturn(position, current);
    if (ret === null) continue;

    valued += 1;
    sumReturn += ret;
    if (!best || ret > best.return) best = { ticker: position.ticker, return: ret };
    if (!worst || ret < worst.return) worst = { ticker: position.ticker, return: ret };

    if (!isNeutral(position.decision)) {
      directional += 1;
      if (ret > 0) wins += 1;
    }
  }

  return {
    trackedCount: positions.length,
    valuedCount: valued,
    openCount,
    closedCount,
    targetHits,
    stopHits,
    sampleSize: directional, // positions behind the win rate
    winRate: directional ? wins / directional : null,
    avgReturn: valued ? sumReturn / valued : null,
    best,
    worst,
  };
}

// Calendar-month maturity via native Date.setMonth (month-end overflow rolls
// forward, e.g. Jan 31 + 1M → Mar 3 — acceptable for a horizon badge).
export function horizonInfo(entryAt, months) {
  const start = new Date(entryAt).getTime();
  if (!Number.isFinite(start)) return { ageDays: null, matured: false, label: '-' };

  const ageDays = Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
  if (!months) return { ageDays, matured: false, label: `${ageDays}d` };

  const maturesAt = new Date(start);
  maturesAt.setMonth(maturesAt.getMonth() + months);
  const matured = Date.now() >= maturesAt.getTime();
  return { ageDays, matured, label: `${ageDays}d / ${months}M` };
}
