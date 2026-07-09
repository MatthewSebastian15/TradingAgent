export function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Black-Scholes-Merton (no dividend) for a European call/put.
//   S spot, K strike, T years to expiry, r risk-free (decimal), sigma vol (decimal).
// -> { price, delta, gamma, vega, theta, rho }. vega/rho per 1% move, theta per day.
export function blackScholes(S, K, T, r, sigma, type = 'call') {
  if (!(S > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdf = 0.3989423 * Math.exp((-d1 * d1) / 2);
  const isCall = type === 'call';
  const price = isCall
    ? S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2)
    : K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
  const theta =
    (-(S * pdf * sigma) / (2 * sqrtT) -
      (isCall ? 1 : -1) * r * K * Math.exp(-r * T) * normCDF(isCall ? d2 : -d2)) /
    365;
  return {
    price,
    delta: isCall ? normCDF(d1) : normCDF(d1) - 1,
    gamma: pdf / (S * sigma * sqrtT),
    vega: (S * pdf * sqrtT) / 100,
    theta,
    rho: ((isCall ? 1 : -1) * K * T * Math.exp(-r * T) * normCDF(isCall ? d2 : -d2)) / 100,
  };
}

// Implied vol via bisection: the sigma that reprices the option to `target`.
// -> sigma (decimal) or null if no bracket in [1e-4, 5].
export function impliedVol(target, S, K, T, r, type = 'call') {
  if (!(target > 0) || !(S > 0) || !(K > 0) || !(T > 0)) return null;
  let lo = 1e-4;
  let hi = 5;
  const price = (s) => blackScholes(S, K, T, r, s, type).price;
  if ((price(lo) - target) * (price(hi) - target) > 0) return null;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    const diff = price(mid) - target;
    if (Math.abs(diff) < 1e-6) return mid;
    if ((price(lo) - target) * diff < 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// Two-stage DCF: `years` of FCF grown at `growth`, then a Gordon terminal value
// at `terminalGrowth`, all discounted at `wacc`. Rates are decimals.
// Requires wacc > terminalGrowth, else the terminal value diverges -> returns null.
// -> { enterpriseValue, equityValue, fairValuePerShare }.
