import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import NoticeBox from '../../../NoticeBox';
import { marketKeyForSymbol, stressTable } from '../../quantUtils';
import { NumberField } from '../charts';
import { DASH, finite, fmtSignedPct } from '../format';
import { FIELD_GRID } from '../layout';
import { ProOnly } from '../mode';
import { fmtMoney } from '../numberFormat';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { LineChart } from '../viz/LineChart';

const REGIME_COLORS = {
  Calm: CHART_COLORS.quaternary,
  Normal: '#525252',
  Stressed: CHART_COLORS.warning,
};

export function ScenarioSection({
  spot,
  ccy,
  symbol,
  ewmaSigma,
  beta,
  benchLabel,
  benchIsSp500,
  benchWorst,
  stockWorst,
  regime,
  pricePoints,
  segments,
}) {
  const [position, setPosition] = useState('');
  const [customShock, setCustomShock] = useState('');
  const isIdx = marketKeyForSymbol(symbol) === 'JK';

  const rows = useMemo(
    () =>
      stressTable({
        spot,
        beta,
        dailySigma: ewmaSigma,
        benchmarkIsSp500: benchIsSp500,
        benchmarkWorst: benchWorst,
        stockWorst,
        customShockPct: customShock === '' ? null : Number(customShock),
      }),
    [spot, beta, ewmaSigma, benchIsSp500, benchWorst, stockWorst, customShock]
  );

  const signedMoney = (v) => (v < 0 ? `-${fmtMoney(Math.abs(v), ccy)}` : `+${fmtMoney(v, ccy)}`);
  const positionValue = Number(position);
  const hasPosition = position !== '' && positionValue > 0;
  const toneClass = (v) => (v < 0 ? 'text-bloomberg-red' : 'text-bloomberg-green');

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        How today&apos;s price ({fmtMoney(spot, ccy)}) moves under shocks: σ moves from current EWMA
        volatility, index moves scaled by β (
        {finite(beta) ? `${beta.toFixed(2)} vs ${benchLabel}` : 'unavailable, using 1'}), and the
        worst windows actually seen in the loaded history. Research only.
      </p>
      {isIdx && (
        <NoticeBox title="IDX price limits">
          IDX applies auto-reject limits that cap a single day&apos;s move by price tier, and those
          rules change. Enter the current lower limit for this stock in &quot;Custom shock&quot; to
          see the one-day floor.
        </NoticeBox>
      )}

      <div className={FIELD_GRID}>
        <NumberField
          label="Position value"
          value={position}
          onChange={setPosition}
          suffix={ccy || 'ccy'}
        />
        <NumberField
          label="Custom shock"
          value={customShock}
          onChange={setCustomShock}
          suffix="%"
        />
      </div>

      <DataTable
        caption="Stress scenarios"
        rowKey={(r) => `${r.group}-${r.label}`}
        rows={rows}
        stickyFirstColumn
        columns={[
          { key: 'label', label: 'Scenario' },
          { key: 'group', label: 'Type', className: () => 'text-bloomberg-white/80' },
          {
            key: 'dates',
            label: 'Dates',
            render: (r) => r.dates || DASH,
            className: () => 'text-bloomberg-white/80',
          },
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
            className: (r) => toneClass(r.lossPct),
          },
          {
            key: 'price',
            label: 'Price after',
            align: 'right',
            render: (r) => fmtMoney(r.price, ccy),
          },
          {
            key: 'pnl',
            label: hasPosition ? 'P&L on position' : 'P&L / share',
            align: 'right',
            render: (r) => signedMoney(hasPosition ? positionValue * r.shock : r.price - spot),
            className: (r) => toneClass(r.shock),
          },
        ]}
      />

      <ProOnly>
        <div className="space-y-2">
          {regime ? (
            <p className="text-[11px] text-bloomberg-white/80">
              Today&apos;s regime is the <span className="text-white">Vol Regime</span> reading in
              the headline. Confirmed shifts in this window: {regime.shifts.length}
              {regime.shifts.length > 0
                ? ` (latest: ${regime.shifts
                    .slice(-3)
                    .map((s) => `${s.from} → ${s.to}`)
                    .join(', ')})`
                : ''}
              .
            </p>
          ) : (
            <NoticeBox title="Regime">Not enough history to detect regime shifts.</NoticeBox>
          )}
          <LineChart
            title="Price and volatility regime"
            subtitle="Background = confirmed regime (cyan calm, grey normal, amber stressed)"
            ariaLabel="Price with volatility regime timeline"
            formatY={(v) => fmtMoney(v, ccy)}
            series={[
              {
                id: 'price',
                label: 'Price',
                color: CHART_COLORS.primary,
                points: pricePoints.map((p) => ({ x: p.date, y: p.value })),
              },
            ]}
            regions={segments.map((s) => ({
              from: s.from,
              to: s.to,
              color: REGIME_COLORS[s.label],
              label: s.label,
            }))}
            emptyMessage="Not enough history for a regime timeline."
          />
        </div>
      </ProOnly>
    </div>
  );
}

const worstShape = PropTypes.arrayOf(
  PropTypes.shape({
    days: PropTypes.number,
    startDate: PropTypes.string,
    endDate: PropTypes.string,
    returnPct: PropTypes.number,
  })
);

ScenarioSection.propTypes = {
  spot: PropTypes.number.isRequired,
  ccy: PropTypes.string,
  symbol: PropTypes.string,
  ewmaSigma: PropTypes.number,
  beta: PropTypes.number,
  benchLabel: PropTypes.string.isRequired,
  benchIsSp500: PropTypes.bool.isRequired,
  benchWorst: worstShape.isRequired,
  stockWorst: worstShape.isRequired,
  regime: PropTypes.object,
  pricePoints: PropTypes.arrayOf(
    PropTypes.shape({ date: PropTypes.string, value: PropTypes.number })
  ).isRequired,
  segments: PropTypes.arrayOf(
    PropTypes.shape({ label: PropTypes.string, from: PropTypes.string, to: PropTypes.string })
  ).isRequired,
};
