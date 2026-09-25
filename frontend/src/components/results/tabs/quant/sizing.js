import { marketKeyForSymbol } from './benchmark';

// Fixed-fractional sizing: risk `riskPct` of capital between entry and stop, long only.
export function positionSize({ capital, entry, stop, riskPct, lotSize = 1 }) {
  if (
    !(capital > 0) ||
    !(entry > 0) ||
    !(stop > 0) ||
    !(riskPct > 0) ||
    !(stop < entry) ||
    !(lotSize >= 1)
  ) {
    return null;
  }
  const perShareRisk = entry - stop;
  const byRisk = (capital * riskPct) / 100 / perShareRisk;
  const byCapital = capital / entry;
  const shares = Math.floor(Math.min(byRisk, byCapital) / lotSize) * lotSize;
  return {
    shares,
    lots: shares / lotSize,
    positionValue: shares * entry,
    capitalPct: Number((((shares * entry) / capital) * 100).toFixed(10)),
    riskAmount: shares * perShareRisk,
    cappedByCapital: byCapital < byRisk,
  };
}

export function lotSizeForSymbol(symbol) {
  return marketKeyForSymbol(symbol) === 'JK' ? 100 : 1;
}
