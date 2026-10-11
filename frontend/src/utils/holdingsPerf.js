import { toPrice } from './price';

// Market-value performance for user-entered holdings. Long-only: gain when the
// current price exceeds cost basis.

// Parse a quote's day-change string ("+2.95%") into a fraction (0.0295).
export function changeFraction(chg) {
  if (typeof chg === 'number') return Number.isFinite(chg) ? chg / 100 : null;
  const match = String(chg ?? '').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) / 100 : null;
}

// holding: { ticker, shares, cost_basis }; price/chg from the live quote.
export function positionStats(holding, price, chg) {
  const shares = Number(holding.shares);
  const cost = shares * Number(holding.cost_basis);
  const livePrice = toPrice(price);
  const value = livePrice === null ? null : shares * livePrice;
  const pl = value === null ? null : value - cost;
  const plPct = pl === null || cost === 0 ? null : pl / cost;

  const chgFrac = changeFraction(chg);
  // Day P/L: today's % move applied to current value (price already includes it).
  const dayPL = value === null || chgFrac === null ? null : value - value / (1 + chgFrac);

  return { shares, cost, value, pl, plPct, dayPL };
}

// rows: [{ holding, price, chg }]
export function summarizeHoldings(rows) {
  let totalCost = 0; // every lot: the "Cost Basis" cell
  let pricedCost = 0; // lots with a live price: the P/L denominator
  let totalValue = 0;
  let totalDayPL = 0;
  let valued = 0;
  let best = null;
  let worst = null;

  for (const { holding, price, chg } of rows) {
    const s = positionStats(holding, price, chg);
    totalCost += s.cost;
    if (s.value === null) continue;
    valued += 1;
    pricedCost += s.cost;
    totalValue += s.value;
    if (s.dayPL !== null) totalDayPL += s.dayPL;
    if (s.plPct !== null) {
      if (!best || s.plPct > best.plPct) best = { ticker: holding.ticker, plPct: s.plPct };
      if (!worst || s.plPct < worst.plPct) worst = { ticker: holding.ticker, plPct: s.plPct };
    }
  }

  const totalPL = valued ? totalValue - pricedCost : null;
  return {
    count: rows.length,
    tickerCount: new Set(rows.map(({ holding }) => holding.ticker)).size,
    valuedCount: valued,
    unpricedCount: rows.length - valued,
    totalCost,
    pricedCost,
    totalValue: valued ? totalValue : null,
    totalPL,
    totalPLPct: totalPL !== null && pricedCost > 0 ? totalPL / pricedCost : null,
    totalDayPL: valued ? totalDayPL : null,
    best,
    worst,
  };
}

// rows: [{ holding, price, chg, currency }] — one summary per currency, largest value first.
export function summarizeByCurrency(rows) {
  const groups = new Map();
  for (const row of rows) {
    const currency = row.currency || 'USD';
    if (!groups.has(currency)) groups.set(currency, []);
    groups.get(currency).push(row);
  }
  return Array.from(groups, ([currency, groupRows]) => ({
    currency,
    ...summarizeHoldings(groupRows),
  })).sort(
    (a, b) => (b.totalValue ?? -1) - (a.totalValue ?? -1) || a.currency.localeCompare(b.currency)
  );
}
