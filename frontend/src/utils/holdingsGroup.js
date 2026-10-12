import { positionStats } from './holdingsPerf';

// rows: [{ holding, price, chg, trend, currency }] — one group per ticker (a ticker has one quote).
// Weighted average cost = total cost / total shares. Lots stay available for expansion.
export function groupByTicker(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.holding.ticker;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return Array.from(groups, ([ticker, lots]) => {
    const [first] = lots;
    const shares = lots.reduce((sum, { holding }) => sum + Number(holding.shares), 0);
    const cost = lots.reduce(
      (sum, { holding }) => sum + Number(holding.shares) * Number(holding.cost_basis),
      0
    );
    const averageCost = shares > 0 ? cost / shares : 0;
    const holding = { id: `group:${ticker}`, ticker, shares, cost_basis: averageCost };
    return {
      ticker,
      lots,
      lotCount: lots.length,
      holding,
      price: first.price,
      chg: first.chg,
      trend: first.trend,
      currency: first.currency,
      stats: positionStats(holding, first.price, first.chg),
    };
  });
}
