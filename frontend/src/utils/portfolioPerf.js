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
  const entryPrice = Number(entry);
  const currentPrice = Number(current);
  if (!Number.isFinite(entryPrice) || !Number.isFinite(currentPrice) || entryPrice === 0) {
    return null;
  }
  const raw = (currentPrice - entryPrice) / entryPrice;
  const direction = decisionDirection(decision);
  return direction === 0 ? raw : raw * direction;
}

// positions: [{ ticker, decision, entry_price }]; priceFor: (ticker) => number.
export function summarize(positions, priceFor) {
  let valued = 0;
  let directional = 0;
  let wins = 0;
  let sumReturn = 0;
  let best = null;
  let worst = null;

  for (const position of positions) {
    const ret = returnPct(position.decision, position.entry_price, priceFor(position.ticker));
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
