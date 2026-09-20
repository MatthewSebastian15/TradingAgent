import PropTypes from 'prop-types';
import { useMemo } from 'react';

import NoticeBox from '../../../NoticeBox';
import { stressScenarios } from '../../quantUtils';
import { MetricCard } from '../charts';
import { DASH, finite, fmtPercent, fmtSignedPct } from '../format';

export function ScenarioSection({ spot, vol, ccy, regime, beta, benchLabel, benchIsSp500 }) {
  const money = (v) => `${ccy ? `${ccy} ` : '$'}${Number(v).toFixed(2)}`;
  const stress = useMemo(
    () => stressScenarios(spot, finite(vol) ? vol : 0, beta),
    [spot, vol, beta]
  );
  // `!` beats .terminal-table's own th/td color (higher specificity than a bare utility).
  const signTone = (v) =>
    v < 0 ? '!text-bloomberg-red' : v > 0 ? '!text-bloomberg-green' : '!text-bloomberg-white';
  const regimeTone = (label) =>
    label === 'Stressed' ? 'bad' : label === 'Calm' ? 'good' : 'neutral';
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        How today&apos;s price ({money(spot)}) would move under a one-day shock — σ moves from this
        name&apos;s own volatility ({fmtPercent(vol)} annual) and S&amp;P 500 crash days scaled by β
        ({finite(beta) ? `β = ${beta.toFixed(2)} vs ${benchLabel}` : 'β unavailable, using 1'}).
        Research only.
      </p>
      {!benchIsSp500 && (
        <NoticeBox title="Approximation">
          {finite(beta)
            ? `β is measured against ${benchLabel}, so S&P 500 crash days scaled by it are only a rough proxy for this market.`
            : 'β is unavailable, so rows use β = 1 and S&P 500 crash days are only a rough proxy for this market.'}
        </NoticeBox>
      )}

      <div className="overflow-x-auto border border-bloomberg-border">
        <table className="terminal-table w-full font-mono text-xs tabular-nums">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left !text-bloomberg-white/80">Scenario</th>
              <th className="px-2 py-1 text-right !text-bloomberg-white/80">Index move</th>
              <th className="px-2 py-1 text-right !text-bloomberg-white/80">Shock</th>
              <th className="px-2 py-1 text-right !text-bloomberg-white/80">Price after</th>
              <th className="px-2 py-1 text-right !text-bloomberg-white/80">P&amp;L / share</th>
            </tr>
          </thead>
          <tbody>
            {stress.map((s) => (
              <tr key={s.label}>
                <td className="px-2 py-1 whitespace-nowrap !text-bloomberg-white">{s.label}</td>
                <td className="px-2 py-1 text-right !text-bloomberg-white">
                  {s.indexShock === null ? DASH : fmtSignedPct(s.indexShock * 100)}
                </td>
                <td className={`px-2 py-1 text-right ${signTone(s.shock)}`}>
                  {fmtSignedPct(s.lossPct)}
                </td>
                <td className="px-2 py-1 text-right !text-bloomberg-white">{money(s.price)}</td>
                <td className={`px-2 py-1 text-right ${signTone(s.shock)}`}>
                  {money(s.price - spot)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
          Volatility regime
        </div>
        {regime ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Current Regime"
              value={regime.current}
              tone={regimeTone(regime.current)}
              gloss="Latest rolling-vol bucket vs this series' own history (Calm / Normal / Stressed)."
            />
            <MetricCard
              label="Days in Regime"
              value={`${regime.daysSince}d`}
              gloss="Trading days since the last regime change."
            />
            <MetricCard
              label="Recent Shifts"
              value={String(regime.shifts.length)}
              gloss="Number of regime transitions in the recent window (last 5 shown)."
            />
          </div>
        ) : (
          <NoticeBox title="Regime">Not enough history to detect regime shifts.</NoticeBox>
        )}
        {regime && regime.shifts.length > 0 && (
          <p className="text-[11px] text-bloomberg-subtle">
            Latest:{' '}
            {regime.shifts
              .slice(-3)
              .map((s) => `${s.from}→${s.to}`)
              .join(', ')}
            .
          </p>
        )}
      </div>
    </div>
  );
}

ScenarioSection.propTypes = {
  spot: PropTypes.number.isRequired,
  vol: PropTypes.number,
  ccy: PropTypes.string,
  regime: PropTypes.object,
  beta: PropTypes.number,
  benchLabel: PropTypes.string.isRequired,
  benchIsSp500: PropTypes.bool.isRequired,
};
