import PropTypes from 'prop-types';
import { useState } from 'react';

import {
  lotSizeForSymbol,
  positionSize,
  suggestedPosition,
  volTargetWeight,
} from '../../quantUtils';
import { MetricCard, NumberField } from '../charts';
import { DASH, finite, fmtNum2, fmtPercent, hurstLabel } from '../format';
import { CARD_GRID, FIELD_GRID } from '../layout';
import { ProOnly } from '../mode';
import { currencyDecimals, fmtInt, fmtMoney } from '../numberFormat';
import { DataTable } from '../viz/DataTable';

const pct = (fraction) => (finite(fraction) ? `${(fraction * 100).toFixed(0)}%` : DASH);

export function SizingSection({
  kelly,
  forecastVol,
  forecastSource,
  volTarget,
  onVolTargetChange,
  hurstInfo,
  adf,
  ouHL,
  spot,
  ccy,
  symbol,
  dailySigma,
}) {
  const lotSize = lotSizeForSymbol(symbol);
  const [capital, setCapital] = useState('');
  const [entry, setEntry] = useState(spot);
  const [stop, setStop] = useState(() =>
    Number(
      (spot * (1 - 2 * (finite(dailySigma) ? dailySigma : 0.02))).toFixed(currencyDecimals(ccy))
    )
  );
  const [riskPct, setRiskPct] = useState(1);

  const volWeight = volTargetWeight(forecastVol, Number(volTarget));
  const suggestion = suggestedPosition(kelly?.lowerBound ?? null, volWeight);
  const plan = positionSize({
    capital: Number(capital),
    entry: Number(entry),
    stop: Number(stop),
    riskPct: Number(riskPct),
    lotSize,
  });

  const diagnostics = [
    {
      metric: 'Hurst exponent',
      value: hurstInfo ? `${fmtNum2(hurstInfo.hurst)} ± ${fmtNum2(hurstInfo.standardError)}` : DASH,
      reading: hurstInfo
        ? hurstLabel(hurstInfo.hurst, hurstInfo.significant)
        : 'Needs 64+ returns.',
    },
    {
      metric: 'ADF t-stat (log price)',
      value: adf ? fmtNum2(adf.tStat) : DASH,
      reading: adf
        ? adf.stationaryAt5
          ? 'Unit root rejected at 5% — mean-reverting'
          : 'Unit root not rejected — no reliable mean level'
        : 'Needs 31+ prices.',
    },
    {
      metric: 'Mean-reversion half-life',
      value: adf?.stationaryAt5 && finite(ouHL) ? `${ouHL.toFixed(0)}d` : DASH,
      reading: adf?.stationaryAt5
        ? 'AR(1) on log prices: ln 2 / θ.'
        : 'Not shown: unit root not rejected.',
    },
    {
      metric: 'Kelly (full)',
      value: pct(kelly?.full),
      reading: 'Excess mean ÷ variance. Theoretical and aggressive.',
    },
    {
      metric: 'Kelly (95% lower bound)',
      value: pct(kelly?.lowerBound),
      reading: 'Uses the pessimistic end of the mean estimate.',
    },
    {
      metric: `Vol-target weight (${volTarget}%)`,
      value: pct(volWeight),
      reading: `Target ÷ forecast vol (${fmtPercent(forecastVol)}, ${forecastSource}). Above 100% = leverage.`,
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        How much to hold, from statistics that account for estimation error. Research only — not
        advice.
      </p>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
        <ProOnly>
          <DataTable
            caption="Sizing diagnostics"
            rowKey={(r) => r.metric}
            rows={diagnostics}
            columns={[
              { key: 'metric', label: 'Metric' },
              { key: 'value', label: 'Value', align: 'right' },
              { key: 'reading', label: 'Reading', className: () => 'text-bloomberg-white/80' },
            ]}
          />
        </ProOnly>
        <div className="space-y-3">
          <NumberField
            label="Vol target"
            value={volTarget}
            onChange={onVolTargetChange}
            suffix="%"
          />
          <div className="border border-bloomberg-border bg-bloomberg-card p-3 font-mono">
            <div className="text-[11px] tracking-wider text-bloomberg-white/80 uppercase">
              Suggested starting point
            </div>
            <div data-testid="suggested-position" className="mt-1 text-2xl text-white tabular-nums">
              {pct(suggestion)}
            </div>
            <div className="mt-1 text-[11px] text-bloomberg-white/80">
              Half of the Kelly lower bound, capped by the vol-target weight. Research only — not
              advice.
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 border border-bloomberg-border p-3">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
          Position calculator
        </div>
        <div className={FIELD_GRID}>
          <NumberField
            label="Capital"
            value={capital}
            onChange={setCapital}
            suffix={ccy || 'ccy'}
          />
          <NumberField label="Entry" value={entry} onChange={setEntry} suffix={ccy || 'ccy'} />
          <NumberField label="Stop" value={stop} onChange={setStop} suffix={ccy || 'ccy'} />
          <NumberField label="Risk per trade" value={riskPct} onChange={setRiskPct} suffix="%" />
          <span className="pb-1 text-[11px] text-bloomberg-white/80">
            Lot size: {lotSize} shares
          </span>
        </div>
        {plan ? (
          <div className={CARD_GRID}>
            <MetricCard label="Shares" value={fmtInt(plan.shares)} />
            <MetricCard label="Lots" value={fmtInt(plan.lots)} />
            <MetricCard label="Position value" value={fmtMoney(plan.positionValue, ccy)} />
            <MetricCard
              label="% of capital"
              value={fmtPercent(plan.capitalPct)}
              gloss={plan.cappedByCapital ? 'Capped by available capital.' : undefined}
            />
            <MetricCard label="Risk if stopped" value={fmtMoney(plan.riskAmount, ccy)} tone="bad" />
          </div>
        ) : (
          <p className="text-[11px] text-bloomberg-white/80">
            Enter capital and a stop below the entry price.
          </p>
        )}
      </div>
    </div>
  );
}

SizingSection.propTypes = {
  kelly: PropTypes.shape({
    full: PropTypes.number,
    lowerBound: PropTypes.number,
    standardError: PropTypes.number,
  }),
  forecastVol: PropTypes.number,
  forecastSource: PropTypes.string.isRequired,
  volTarget: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  onVolTargetChange: PropTypes.func.isRequired,
  hurstInfo: PropTypes.object,
  adf: PropTypes.object,
  ouHL: PropTypes.number,
  spot: PropTypes.number.isRequired,
  ccy: PropTypes.string,
  symbol: PropTypes.string,
  dailySigma: PropTypes.number,
};
