import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';

import NoticeBox from '../../../NoticeBox';
import {
  blackScholes,
  breakeven,
  dividendYieldFromOverview,
  expectedMove,
  optionCurves,
  solveImpliedVol,
  trailingVol,
} from '../../quantUtils';
import { MetricCard, NumberField } from '../charts';
import { DASH, finite, fmtNum2, fmtPercent } from '../format';
import { FIELD_GRID } from '../layout';
import { ProOnly } from '../mode';
import { currencyDecimals, fmtMoney } from '../numberFormat';
import { loadPreset, savePreset } from '../presets';
import { SegmentedControl } from '../SegmentedControl';
import { validateOptions } from '../validation';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { LineChart } from '../viz/LineChart';

const PRESETS = [
  { label: 'ATM', move: 0 },
  { label: '−10%', move: -0.1 },
  { label: '−5%', move: -0.05 },
  { label: '+5%', move: 0.05 },
  { label: '+10%', move: 0.1 },
];

const IV_REASONS = {
  below_intrinsic: 'That price is at or below intrinsic value — no volatility can produce it.',
  above_max: 'That price is above the theoretical maximum for this option.',
  no_convergence: 'The solver did not converge for this price.',
  invalid_input: 'Check strike, days to expiry and price.',
};

export function OptionsSection({
  spot,
  closes,
  ppy,
  defaultRate,
  ccy,
  overview,
  fallbackVol,
  symbol,
}) {
  const decimals = currencyDecimals(ccy);
  const [preset] = useState(() => loadPreset('options', symbol) || {});
  const [strike, setStrike] = useState(Number(spot.toFixed(decimals)));
  const [days, setDays] = useState(preset.days ?? 30);
  const [volInput, setVolInput] = useState(preset.volInput ?? '');
  const [rate, setRate] = useState(preset.rate ?? Number((defaultRate * 100).toFixed(2)));
  const [yieldInput, setYieldInput] = useState(preset.yieldInput ?? '');
  const [type, setType] = useState(preset.type === 'put' ? 'put' : 'call');
  const [marketPrice, setMarketPrice] = useState('');

  useEffect(() => {
    savePreset('options', symbol, { days, volInput, rate, yieldInput, type });
  }, [symbol, days, volInput, rate, yieldInput, type]);

  const autoVol = useMemo(() => {
    const v = trailingVol(closes, Number(days) || 30, ppy);
    return finite(v) && v > 0 ? v : fallbackVol;
  }, [closes, days, ppy, fallbackVol]);
  const autoYield = dividendYieldFromOverview(overview, spot) * 100;
  const volPct = volInput === '' ? autoVol : Number(volInput);
  const yieldPct = yieldInput === '' ? autoYield : Number(yieldInput);

  const K = Number(strike);
  const T = Number(days) / 365;
  const r = Number(rate) / 100;
  const sigma = Number(volPct) / 100;
  const q = Number(yieldPct) / 100;
  const errors = validateOptions({ strike, days, volPct, rate, yieldPct });
  const hasErrors = Object.keys(errors).length > 0;
  const call = blackScholes(spot, K, T, r, sigma, 'call', q);
  const put = blackScholes(spot, K, T, r, sigma, 'put', q);
  const selected = type === 'call' ? call : put;
  const premium = selected?.price;

  const curves = useMemo(() => {
    const p = blackScholes(spot, K, T, r, sigma, type, q)?.price;
    return finite(p) ? optionCurves({ type, strike: K, T, r, sigma, q, premium: p, spot }) : null;
  }, [type, K, T, r, sigma, q, spot]);
  const iv =
    marketPrice === '' ? null : solveImpliedVol(Number(marketPrice), spot, K, T, r, type, q);
  const money = (v) => fmtMoney(v, ccy);
  const volWindow = Math.max(10, Math.round(((Number(days) || 30) * ppy) / 365));

  const rows =
    call && put
      ? [
          { metric: 'Fair value', call: money(call.price), put: money(put.price) },
          { metric: 'Delta', call: fmtNum2(call.delta), put: fmtNum2(put.delta) },
          { metric: 'Gamma', call: call.gamma.toFixed(4), put: put.gamma.toFixed(4) },
          { metric: 'Vega (per 1 vol pt)', call: fmtNum2(call.vega), put: fmtNum2(put.vega) },
          { metric: 'Theta (per day)', call: fmtNum2(call.theta), put: fmtNum2(put.theta) },
          { metric: 'Rho (per 1% rate)', call: fmtNum2(call.rho), put: fmtNum2(put.rho) },
          {
            metric: 'P(ITM), risk-neutral',
            call: fmtPercent(call.probItm * 100),
            put: fmtPercent(put.probItm * 100),
          },
          {
            metric: 'Breakeven at expiry',
            call: money(breakeven('call', K, call.price)),
            put: money(breakeven('put', K, put.price)),
          },
        ]
      : [];
  const parityGap =
    call && put ? call.price - put.price - (spot * Math.exp(-q * T) - K * Math.exp(-r * T)) : null;
  const move = finite(sigma) && T > 0 ? expectedMove(spot, sigma, T) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        European option value via Black-Scholes-Merton with a continuous dividend yield. Spot is
        today&apos;s close ({money(spot)}). Research only.
      </p>

      <div className={FIELD_GRID}>
        <div className="flex flex-col gap-1">
          <NumberField
            label="Strike"
            value={strike}
            onChange={setStrike}
            suffix={ccy || undefined}
            error={errors.strike}
          />
          <SegmentedControl
            size="sm"
            ariaLabel="Strike preset"
            options={PRESETS.map((p) => ({ id: p.label, label: p.label }))}
            value={null}
            onChange={(id) => {
              const preset = PRESETS.find((p) => p.label === id);
              setStrike(Number((spot * (1 + preset.move)).toFixed(decimals)));
            }}
          />
        </div>
        <NumberField
          label="Days to expiry"
          value={days}
          onChange={setDays}
          step="1"
          suffix="d"
          error={errors.days}
        />
        <NumberField
          label="Volatility"
          value={volInput === '' ? Number(volPct.toFixed(1)) : volInput}
          onChange={setVolInput}
          suffix="%"
          error={errors.vol}
          hint={
            volInput === ''
              ? `Auto: ${fmtPercent(autoVol)} (${volWindow}-period realized)`
              : undefined
          }
          onReset={volInput === '' ? undefined : () => setVolInput('')}
        />
        <NumberField
          label="Risk-free rate"
          value={rate}
          onChange={setRate}
          suffix="%"
          error={errors.rate}
        />
        <NumberField
          label="Dividend yield"
          value={yieldInput === '' ? Number(yieldPct.toFixed(2)) : yieldInput}
          onChange={setYieldInput}
          suffix="%"
          error={errors.yield}
          hint={yieldInput === '' ? `Auto: ${autoYield.toFixed(2)}%` : undefined}
          onReset={yieldInput === '' ? undefined : () => setYieldInput('')}
        />
        <SegmentedControl
          label="Chart type"
          ariaLabel="Option type"
          options={[
            { id: 'call', label: 'Call' },
            { id: 'put', label: 'Put' },
          ]}
          value={type}
          onChange={setType}
        />
      </div>

      {hasErrors ? (
        <p role="status" className="text-[11px] text-bloomberg-white/80">
          Fix the highlighted fields.
        </p>
      ) : !call || !put ? (
        <NoticeBox title="Check inputs">
          Strike, days and volatility must all be positive.
        </NoticeBox>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_300px]">
            <DataTable
              caption="Call vs put"
              rowKey={(row) => row.metric}
              rows={rows}
              columns={[
                { key: 'metric', label: 'Metric' },
                { key: 'call', label: 'Call', align: 'right' },
                { key: 'put', label: 'Put', align: 'right' },
              ]}
            />
            <div className="space-y-3">
              <MetricCard
                label="Expected move (±1σ)"
                value={finite(move) ? `±${money(move)}` : DASH}
                gloss={
                  finite(move)
                    ? `${money(spot - move)} – ${money(spot + move)} by expiry (68% under the model).`
                    : undefined
                }
              />
              <ProOnly>
                <MetricCard
                  label="Put-call parity gap"
                  value={finite(parityGap) ? parityGap.toExponential(1) : DASH}
                  gloss="C − P − (S·e^(−qT) − K·e^(−rT)); ~0 confirms the pricer."
                />
              </ProOnly>
            </div>
          </div>

          {curves && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <LineChart
                title={`${type} profit per share`}
                subtitle="Net of today's premium"
                ariaLabel="Option payoff at expiry and today"
                xType="number"
                formatX={money}
                formatY={money}
                series={[
                  {
                    id: 'today',
                    label: 'Today',
                    color: CHART_COLORS.tertiary,
                    points: curves.today,
                  },
                  {
                    id: 'expiry',
                    label: 'At expiry',
                    color: CHART_COLORS.primary,
                    width: 2,
                    points: curves.payoff,
                  },
                ]}
                referenceLines={[{ y: 0, color: CHART_COLORS.axis }]}
                verticalLines={[
                  { x: K, label: 'Strike', color: CHART_COLORS.secondary },
                  { x: spot, label: 'Spot', color: CHART_COLORS.quaternary },
                  {
                    x: breakeven(type, K, premium),
                    label: 'Breakeven',
                    color: CHART_COLORS.warning,
                  },
                ]}
              />
              <ProOnly>
                <LineChart
                  title={`${type} delta and gamma vs spot`}
                  ariaLabel="Delta and gamma versus spot"
                  xType="number"
                  formatX={money}
                  formatY={(v) => v.toFixed(2)}
                  series={[
                    {
                      id: 'delta',
                      label: 'Delta',
                      color: CHART_COLORS.primary,
                      points: curves.delta,
                    },
                    {
                      id: 'gamma',
                      label: 'Gamma × 100',
                      color: CHART_COLORS.tertiary,
                      points: curves.gamma.map((p) => ({
                        x: p.x,
                        y: finite(p.y) ? p.y * 100 : null,
                      })),
                    },
                  ]}
                  verticalLines={[{ x: spot, label: 'Spot', color: CHART_COLORS.quaternary }]}
                />
              </ProOnly>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-end gap-4 border border-bloomberg-border bg-bloomberg-card p-3">
        <NumberField label="Market price" value={marketPrice} onChange={setMarketPrice} />
        <div className="font-mono text-[11px] text-bloomberg-white/80">
          <div className="tracking-wider uppercase">Implied volatility ({type})</div>
          <div className="mt-1 text-2xl text-white tabular-nums">
            {iv?.iv != null ? `${(iv.iv * 100).toFixed(1)}%` : DASH}
          </div>
        </div>
        <p className="max-w-sm text-[11px] text-bloomberg-white/80">
          {iv?.reason
            ? IV_REASONS[iv.reason]
            : 'Enter a quoted option price to back out the volatility the market prices in.'}
        </p>
      </div>
    </div>
  );
}

OptionsSection.propTypes = {
  spot: PropTypes.number.isRequired,
  closes: PropTypes.arrayOf(PropTypes.number).isRequired,
  ppy: PropTypes.number.isRequired,
  defaultRate: PropTypes.number.isRequired,
  ccy: PropTypes.string,
  overview: PropTypes.object,
  fallbackVol: PropTypes.number,
  symbol: PropTypes.string.isRequired,
};
