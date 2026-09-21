import { mean, TRADING_DAYS } from './stats';

// GARCH(1,1) with variance targeting, fitted by Gaussian log-likelihood on a grid.
// Non-finite returns are dropped before fitting (observations counts what was used).
// ponytail: 580-point grid instead of an optimizer; ~0.3M ops for 500 returns. Swap for
// Nelder-Mead only if parameter precision beyond 0.01 ever matters.
export function fitGarch(returns) {
  if (!Array.isArray(returns)) return null;
  const clean = returns.filter((r) => Number.isFinite(r));
  const n = clean.length;
  if (n < 100) return null;
  const m = mean(clean);
  const e = clean.map((r) => r - m);
  const e2 = e.map((x) => x * x);
  const sampleVariance = e2.reduce((a, x) => a + x, 0) / n;
  // Floor, not `> 0`: demeaning a constant series leaves ~1e-37 float residue.
  if (!(sampleVariance > 1e-16)) return null;

  let best = null;
  for (let ai = 1; ai <= 20; ai += 1) {
    const a = ai / 100;
    for (let bi = 70; bi <= 98; bi += 1) {
      const b = bi / 100;
      if (a + b >= 0.999) continue;
      const omega = sampleVariance * (1 - a - b);
      // h is the conditional variance for observation t; it is updated AFTER use,
      // so on exit h = h_{n+1} (the next-period variance).
      let h = sampleVariance;
      let ll = 0;
      for (let t = 0; t < n; t += 1) {
        ll -= 0.5 * (Math.log(h) + e2[t] / h);
        h = omega + a * e2[t] + b * h;
      }
      if (!best || ll > best.logLikelihood) {
        best = { alpha: a, beta: b, omega, logLikelihood: ll, nextVariance: h };
      }
    }
  }
  return {
    ...best,
    persistence: best.alpha + best.beta,
    longRunVariance: sampleVariance,
    observations: n,
  };
}

export function garchForecast(fit, days, ppy = TRADING_DAYS) {
  if (!fit || !(days >= 1)) return null;
  const { persistence, longRunVariance, nextVariance } = fit;
  const path = [];
  let sum = 0;
  for (let k = 1; k <= days; k += 1) {
    const h = longRunVariance + persistence ** (k - 1) * (nextVariance - longRunVariance);
    path.push(h);
    sum += h;
  }
  const avg = sum / days;
  return { dailySigma: Math.sqrt(avg), annualVol: Math.sqrt(avg * ppy) * 100, path };
}

export function garchTermStructure(fit, horizons = [5, 21, 63, 126, 252], ppy = TRADING_DAYS) {
  if (!fit) return [];
  return horizons.map((days) => ({ days, annualVol: garchForecast(fit, days, ppy).annualVol }));
}
