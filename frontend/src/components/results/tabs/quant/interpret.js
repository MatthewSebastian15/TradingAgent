import { finite } from './format';

const pct1 = (v) => `${Math.abs(v).toFixed(1)}%`;

const REGIME_PHRASE = {
  Calm: 'below its usual range for this stock',
  Normal: 'within its usual range for this stock',
  Stressed: 'above its usual range for this stock',
};

// Plain-language reading of the headline numbers. Descriptive only: no buy/sell wording.
export function interpretSummary({
  symbol,
  vol,
  regimeLabel,
  currentDrawdown,
  underwaterDays,
  beta,
  benchLabel,
  sharpe,
  sharpeTStat,
  observations,
}) {
  const parts = [];
  if (finite(vol)) {
    const phrase = REGIME_PHRASE[regimeLabel];
    parts.push(
      `${symbol || 'This series'} has moved about ${pct1(vol)} a year${phrase ? `, ${phrase}` : ''}.`
    );
  }
  if (finite(currentDrawdown)) {
    parts.push(
      currentDrawdown <= -1
        ? `It trades ${pct1(currentDrawdown)} below its peak in this window${
            underwaterDays > 0 ? ` and has not recovered for ${underwaterDays} days` : ''
          }.`
        : 'It trades at or near its peak for this window.'
    );
  }
  if (finite(beta)) {
    const how = beta > 1.1 ? 'more than' : beta < 0.9 ? 'less than' : 'roughly in line with';
    parts.push(`Beta ${beta.toFixed(2)} vs ${benchLabel}: it has swung ${how} the index.`);
  }
  if (finite(sharpe)) {
    const weak = finite(sharpeTStat) && Math.abs(sharpeTStat) < 2;
    parts.push(
      `Risk-adjusted return (Sharpe ${sharpe.toFixed(2)}) is ${sharpe >= 0 ? 'positive' : 'negative'}${
        weak ? ' but not statistically different from zero' : ''
      }.`
    );
  }
  if (finite(observations) && observations < 126) {
    parts.push(`Only ${observations} observations — treat these readings as low confidence.`);
  }
  parts.push('Research only — not advice.');
  return parts.join(' ');
}

// One status for the context bar. Loading is not a problem, only failures are.
export function dataStatus({ issues = [], benchStatus, overviewError }) {
  const reasons = [];
  if (issues.length > 0)
    reasons.push(`${issues.length} data warning${issues.length === 1 ? '' : 's'}`);
  if (benchStatus === 'unavailable') reasons.push('benchmark unavailable');
  if (overviewError) reasons.push('fundamentals unavailable');
  return { label: reasons.length > 0 ? 'LIMITED' : 'OK', reasons };
}
