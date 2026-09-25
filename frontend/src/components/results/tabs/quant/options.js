import { annualizedVol, TRADING_DAYS } from './stats';

export function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Black-Scholes-Merton with continuous dividend yield q.
//   S spot, K strike, T years, r risk-free, sigma vol, q dividend yield (all decimals).
// -> { price, delta, gamma, vega (per 1%), theta (per day), rho (per 1%), d2, probItm }.
export function blackScholes(S, K, T, r, sigma, type = 'call', q = 0) {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdf = 0.3989423 * Math.exp((-d1 * d1) / 2);
  const dfq = Math.exp(-q * T);
  const dfr = Math.exp(-r * T);
  const isCall = type === 'call';
  const price = isCall
    ? S * dfq * normCDF(d1) - K * dfr * normCDF(d2)
    : K * dfr * normCDF(-d2) - S * dfq * normCDF(-d1);
  const decay = -(S * dfq * pdf * sigma) / (2 * sqrtT);
  const theta = isCall
    ? (decay - r * K * dfr * normCDF(d2) + q * S * dfq * normCDF(d1)) / 365
    : (decay + r * K * dfr * normCDF(-d2) - q * S * dfq * normCDF(-d1)) / 365;
  return {
    price,
    delta: isCall ? dfq * normCDF(d1) : dfq * (normCDF(d1) - 1),
    gamma: (dfq * pdf) / (S * sigma * sqrtT),
    vega: (S * dfq * pdf * sqrtT) / 100,
    theta,
    rho: ((isCall ? 1 : -1) * K * T * dfr * normCDF(isCall ? d2 : -d2)) / 100,
    d2,
    probItm: isCall ? normCDF(d2) : normCDF(-d2),
  };
}

export function solveImpliedVol(target, S, K, T, r, type = 'call', q = 0) {
  if (!(target > 0) || !(S > 0) || !(K > 0) || !(T > 0))
    return { iv: null, reason: 'invalid_input' };
  const dfq = Math.exp(-q * T);
  const dfr = Math.exp(-r * T);
  const lower = type === 'call' ? Math.max(0, S * dfq - K * dfr) : Math.max(0, K * dfr - S * dfq);
  const upper = type === 'call' ? S * dfq : K * dfr;
  if (target <= lower) return { iv: null, reason: 'below_intrinsic' };
  if (target >= upper) return { iv: null, reason: 'above_max' };

  let sigma = 0.3;
  for (let i = 0; i < 20; i += 1) {
    const res = blackScholes(S, K, T, r, sigma, type, q);
    const diff = res.price - target;
    if (Math.abs(diff) < 1e-10) return { iv: sigma, reason: null };
    const vega = res.vega * 100;
    const next = vega > 1e-8 ? sigma - diff / vega : NaN;
    if (!(next > 1e-4 && next < 5)) break;
    sigma = next;
  }

  const price = (s) => blackScholes(S, K, T, r, s, type, q).price - target;
  let lo = 1e-4;
  let hi = 5;
  let fLo = price(lo);
  if (fLo * price(hi) > 0) return { iv: null, reason: 'no_convergence' };
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = price(mid);
    if (Math.abs(fMid) < 1e-10) return { iv: mid, reason: null };
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return { iv: (lo + hi) / 2, reason: null };
}

export function impliedVol(target, S, K, T, r, type = 'call') {
  return solveImpliedVol(target, S, K, T, r, type).iv;
}

// Realized vol over roughly the option's life (at least 10 periods).
export function trailingVol(closes, days, ppy = TRADING_DAYS) {
  const window = Math.max(10, Math.round((days * ppy) / 365));
  return annualizedVol(closes.slice(-(window + 1)), ppy);
}

// yfinance `dividendYield` changed units between versions; rate ÷ spot is unambiguous.
export function dividendYieldFromOverview(overview, spot) {
  const rate = overview?.div_rate;
  return Number.isFinite(rate) && rate > 0 && spot > 0 ? rate / spot : 0;
}

export function breakeven(type, strike, premium) {
  return type === 'call' ? strike + premium : strike - premium;
}

export function expectedMove(spot, sigma, T) {
  return spot * sigma * Math.sqrt(T);
}

export function optionCurves({ type, strike, T, r, sigma, q = 0, premium, spot, points = 81 }) {
  const lo = 0.6 * Math.min(strike, spot);
  const hi = 1.4 * Math.max(strike, spot);
  const payoff = [];
  const today = [];
  const delta = [];
  const gamma = [];
  for (let i = 0; i < points; i += 1) {
    const x = lo + ((hi - lo) * i) / (points - 1);
    const intrinsic = type === 'call' ? Math.max(0, x - strike) : Math.max(0, strike - x);
    const bs = blackScholes(x, strike, T, r, sigma, type, q);
    payoff.push({ x, y: intrinsic - premium });
    today.push({ x, y: (bs ? bs.price : intrinsic) - premium });
    delta.push({ x, y: bs ? bs.delta : null });
    gamma.push({ x, y: bs ? bs.gamma : null });
  }
  return { payoff, today, delta, gamma };
}

// Two-stage DCF: `years` of FCF grown at `growth`, then a Gordon terminal value
// at `terminalGrowth`, all discounted at `wacc`. Rates are decimals.
// Requires wacc > terminalGrowth, else the terminal value diverges -> returns null.
// -> { enterpriseValue, equityValue, fairValuePerShare }.
