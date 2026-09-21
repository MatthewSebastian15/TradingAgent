import PropTypes from 'prop-types';
import { useMemo } from 'react';

import NoticeBox from '../../../NoticeBox';
import { stressScenarios } from '../../quantUtils';
import { MetricCard } from '../charts';
import { DASH, finite, fmtPercent, fmtSignedPct } from '../format';
import { fmtMoney as formatMoney } from '../numberFormat';
import { DataTable } from '../viz/DataTable';

export function ScenarioSection({
  spot,
  vol,
  ccy,
  regime,
  beta,
  betaLoading = false,
  benchLabel,
  benchIsSp500,
  ppy = 252,
}) {
  const money = (v) => formatMoney(v, ccy);
  const stress = useMemo(
    () => stressScenarios(spot, finite(vol) ? vol : 0, beta, ppy),
    [spot, vol, beta, ppy]
  );
  // Sign of the shown value decides the color, never the scenario type: a negative beta
  // turns crash days into gains, and gains are never red.
  const signTone = (v) =>
    v < 0 ? 'text-bloomberg-red' : v > 0 ? 'text-bloomberg-green' : 'text-bloomberg-white';
  const regimeTone = (label) =>
    label === 'Stressed' ? 'bad' : label === 'Calm' ? 'good' : 'neutral';
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        How today&apos;s price ({money(spot)}) would move under a one-day shock — σ moves from this
        name&apos;s own volatility ({fmtPercent(vol)} annual) and S&amp;P 500 crash days scaled by β
        (
        {finite(beta)
          ? `β = ${beta.toFixed(2)} vs ${benchLabel}`
          : betaLoading
            ? 'β loading, using 1'
            : 'β unavailable, using 1'}
        ). Research only.
      </p>
      {!benchIsSp500 && !(betaLoading && !finite(beta)) && (
        <NoticeBox title="Approximation">
          {finite(beta)
            ? `β is measured against ${benchLabel}, so S&P 500 crash days scaled by it are only a rough proxy for this market.`
            : 'β is unavailable, so rows use β = 1 and S&P 500 crash days are only a rough proxy for this market.'}
        </NoticeBox>
      )}

      <DataTable
        caption="One-day stress scenarios"
        rows={stress}
        rowKey={(r) => r.label}
        columns={[
          { key: 'label', label: 'Scenario' },
          {
            key: 'index',
            label: 'Index move',
            align: 'right',
            render: (r) => (r.indexShock === null ? DASH : fmtSignedPct(r.indexShock * 100)),
          },
          {
            key: 'shock',
            label: 'Shock',
            align: 'right',
            render: (r) => fmtSignedPct(r.lossPct),
            className: (r) => signTone(r.shock),
          },
          { key: 'price', label: 'Price after', align: 'right', render: (r) => money(r.price) },
          {
            key: 'pnl',
            label: 'P&L / share',
            align: 'right',
            render: (r) => money(r.price - spot),
            className: (r) => signTone(r.shock),
          },
        ]}
      />

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
          <p className="text-[11px] text-bloomberg-white/80">
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
  betaLoading: PropTypes.bool,
  benchLabel: PropTypes.string.isRequired,
  benchIsSp500: PropTypes.bool.isRequired,
  ppy: PropTypes.number,
};
