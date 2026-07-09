import PropTypes from 'prop-types';

import { MetricCard } from '../charts';
import { VOL_TARGET } from '../config';
import { finite, DASH, fmtNum2, fmtPercent, hurstLabel } from '../format';

export function SizingSection({ kelly, volWeight, vol, regime, hurstVal }) {
  const kellyClamped = finite(kelly) ? Math.max(0, Math.min(1, kelly)) : null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        How much to hold, from the stats already computed. Kelly is theoretical and aggressive —
        most use a fraction of it.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Regime"
          value={regime.label}
          tone={regime.tone}
          gloss="Current volatility percentile vs this series' own history."
          formula="Latest 21-day rolling vol's percentile rank. <33% calm, >66% stressed."
        />
        <MetricCard
          label="Hurst Exponent"
          value={`${fmtNum2(hurstVal)} · ${hurstLabel(hurstVal)}`}
          gloss=">0.5 trending (momentum fits); <0.5 mean-reverting."
          formula="Single-window rescaled-range R/S on daily returns."
        />
        <MetricCard
          label="Kelly Fraction"
          value={finite(kelly) ? `${(kelly * 100).toFixed(0)}%` : DASH}
          gloss="Full-Kelly weight. Negative means no edge — don't hold."
          formula="mean(returns) / variance(returns). Clamped for the sizing readout below."
        />
        <MetricCard
          label={`Vol-Target Weight (${VOL_TARGET}%)`}
          value={finite(volWeight) ? `${(volWeight * 100).toFixed(0)}%` : DASH}
          gloss={`Scales exposure so annual vol ≈ ${VOL_TARGET}%. >100% means leverage.`}
          formula={`${VOL_TARGET}% ÷ realized annual vol (${fmtPercent(vol)}).`}
        />
      </div>
      <div className="border border-bloomberg-border bg-bloomberg-card p-3 font-mono text-xs text-bloomberg-subtle">
        Suggested starting point: half-Kelly ≈{' '}
        <span className="text-white">
          {kellyClamped != null ? `${((kellyClamped / 2) * 100).toFixed(0)}%` : DASH}
        </span>{' '}
        of capital, capped by the vol-target weight. Research only — not advice.
      </div>
    </div>
  );
}

SizingSection.propTypes = {
  kelly: PropTypes.number,
  volWeight: PropTypes.number,
  vol: PropTypes.number,
  regime: PropTypes.shape({ label: PropTypes.string, tone: PropTypes.string }).isRequired,
  hurstVal: PropTypes.number,
};
