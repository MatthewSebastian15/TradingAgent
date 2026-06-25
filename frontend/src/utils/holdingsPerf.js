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
  const hasPrice = Number.isFinite(Number(price));
  const value = hasPrice ? shares * Number(price) : null;
  const pl = value === null ? null : value - cost;
  const plPct = pl === null || cost === 0 ? null : pl / cost;

  const chgFrac = changeFraction(chg);
  // Day P/L: today's % move applied to current value (price already includes it).
  const dayPL = value === null || chgFrac === null ? null : value - value / (1 + chgFrac);

  return { shares, cost, value, pl, plPct, dayPL };
}

// rows: [{ holding, price, chg }]
export function summarizeHoldings(rows) {
  let totalCost = 0;
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
    totalValue += s.value;
    if (s.dayPL !== null) totalDayPL += s.dayPL;
    if (s.plPct !== null) {
      if (!best || s.plPct > best.plPct) best = { ticker: holding.ticker, plPct: s.plPct };
      if (!worst || s.plPct < worst.plPct) worst = { ticker: holding.ticker, plPct: s.plPct };
    }
  }

  const totalPL = valued ? totalValue - totalCost : null;
  return {
    count: rows.length,
    valuedCount: valued,
    totalCost,
    totalValue: valued ? totalValue : null,
    totalPL,
    totalPLPct: totalPL !== null && totalCost > 0 ? totalPL / totalCost : null,
    totalDayPL: valued ? totalDayPL : null,
    best,
    worst,
  };
}
