import { mean, stdDev, TRADING_DAYS } from './stats';

// --- benchmark-relative (v2) ----------------------------------------------

// Map a ticker to its home-market headline index, by yfinance suffix. No suffix
// (or unknown) → US S&P 500. Picking the right index makes beta/alpha correct for
// non-US names instead of "approximate vs ^GSPC".
// ponytail: suffix lookup table. Add a row when a new market actually matters.
const US_BENCHMARK = { symbol: '^GSPC', label: 'S&P 500' };
const MARKET_BENCHMARKS = {
  JK: { symbol: '^JKSE', label: 'IDX Composite' },
  HK: { symbol: '^HSI', label: 'Hang Seng' },
  T: { symbol: '^N225', label: 'Nikkei 225' },
  L: { symbol: '^FTSE', label: 'FTSE 100' },
  AX: { symbol: '^AXJO', label: 'ASX 200' },
  NS: { symbol: '^NSEI', label: 'NIFTY 50' },
  BO: { symbol: '^BSESN', label: 'SENSEX' },
  SS: { symbol: '000001.SS', label: 'SSE Composite' },
  SZ: { symbol: '399001.SZ', label: 'SZSE Component' },
  DE: { symbol: '^GDAXI', label: 'DAX' },
  PA: { symbol: '^FCHI', label: 'CAC 40' },
  TO: { symbol: '^GSPTSE', label: 'S&P/TSX' },
  SI: { symbol: '^STI', label: 'Straits Times' },
  KS: { symbol: '^KS11', label: 'KOSPI' },
  SW: { symbol: '^SSMI', label: 'SMI' },
};

export function benchmarkForSymbol(symbol) {
  const s = String(symbol || '').toUpperCase();
  const dot = s.lastIndexOf('.');
  if (dot === -1) return US_BENCHMARK;
  return MARKET_BENCHMARKS[s.slice(dot + 1)] || US_BENCHMARK;
}

// Pair two date->close series on their common trading days, in stock order.
// -> { stock:number[], market:number[] } of equal length.
export function alignByDate(stockPoints, marketPoints) {
  const byDate = new Map();
  for (const p of marketPoints || []) {
    const date = String(p?.date || '').slice(0, 10);
    const close = p?.adjusted_close ?? p?.close;
    if (date && close != null) byDate.set(date, close);
  }
  const stock = [];
  const market = [];
  for (const p of stockPoints || []) {
    const date = String(p?.date || '').slice(0, 10);
    const close = p?.adjusted_close ?? p?.close;
    if (date && close != null && byDate.has(date)) {
      stock.push(close);
      market.push(byDate.get(date));
    }
  }
  return { stock, market };
}

// Sample covariance (n-1) of two equal-length series.
export function covariance(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (xs[i] - mx) * (ys[i] - my);
  return sum / (n - 1);
}

// Beta: how much the stock moves per unit of market move. cov/var, both sample.
export function beta(stockReturns, marketReturns) {
  const cov = covariance(stockReturns, marketReturns);
  const varM = stdDev(marketReturns) ** 2;
  if (cov === null || !varM) return null;
  return cov / varM;
}

// Jensen's alpha, annualized %. rf is the per-period (daily) risk-free rate.
export function alpha(stockReturns, marketReturns, rf = 0) {
  const b = beta(stockReturns, marketReturns);
  if (b === null || stockReturns.length < 2) return null;
  const excessStock = mean(stockReturns) - rf;
  const excessMarket = mean(marketReturns) - rf;
  return (excessStock - b * excessMarket) * TRADING_DAYS * 100;
}

// Bin any number array into a histogram. Works for returns or terminal prices.
export function returnHistogram(values, bins = 30) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({
    binStart: min + i * width,
    binEnd: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
    out[idx].count += 1;
  }
  return out;
}
