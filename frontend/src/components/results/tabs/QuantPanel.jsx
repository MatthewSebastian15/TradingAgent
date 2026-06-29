import PropTypes from 'prop-types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import { getApiStatus, getMarketOhlcv } from '../../../api/market';
import NoticeBox from '../NoticeBox';
import { GRID_COLOR, LAST_PRICE_COLOR } from './priceChartUtils';
import PriceMetricLineChart from './PriceMetricLineChart';
import {
  alignByDate,
  alignManyByDate,
  alpha,
  annualizedVol,
  backtest,
  beta,
  bootstrapMC,
  calmar,
  correlationMatrix,
  covarianceMatrix,
  cvar,
  downsideDeviation,
  drawdownSeries,
  efficientFrontier,
  ewmaVol,
  gmvWeights,
  historicalVaR,
  hurst,
  kellyFraction,
  kurtosis,
  logReturns,
  maxDrawdown,
  mean,
  monteCarloGBM,
  parametricVaR,
  portfolioStats,
  returnHistogram,
  rollingBeta,
  rollingCorrelation,
  rollingSharpe,
  rollingVol,
  sharpe,
  simpleReturns,
  skewness,
  sortino,
  stdDev,
  tangencyWeights,
  volPercentile,
  volTargetWeight,
} from './quantUtils';

const ROLLING_WINDOW = 21;
const ROLLING_RATIO_WINDOW = 63; // ~3 months for rolling Sharpe / beta
const MC_PATHS = 5000; // perf cap (Section 4.5)
const MC_DAYS = 126; // ~6 months
const MC_HORIZONS = [21, 63, 126, 252]; // 1M / 3M / 6M / 1Y
const TRADING_DAYS = 252;
const VOL_TARGET = 15; // annual % target for vol-target sizing
// ponytail: fixed US benchmark. Beta vs ^GSPC is approximate for non-US tickers;
// the card tooltip says so. Swap to a per-market index map only if anyone asks.
const BENCHMARK_SYMBOL = '^GSPC';

const SECTIONS = [
  { id: 'volatility', label: 'Volatility' },
  { id: 'risk', label: 'Risk' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'stochastic', label: 'Stochastic' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'sizing', label: 'Sizing' },
  { id: 'correlation', label: 'Correlation' },
];

const STRATEGIES = [
  { id: 'sma', label: 'SMA Crossover' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'meanrev', label: 'Mean Reversion' },
];

function regimeLabel(pct) {
  if (!finite(pct)) return { label: 'Unknown', tone: 'neutral' };
  if (pct < 33) return { label: 'Calm', tone: 'good' };
  if (pct < 66) return { label: 'Normal', tone: 'neutral' };
  return { label: 'Stressed', tone: 'bad' };
}

function hurstLabel(h) {
  if (!finite(h)) return 'Unknown';
  if (h > 0.55) return 'Trending';
  if (h < 0.45) return 'Mean-reverting';
  return 'Random walk';
}

// --- formatting -----------------------------------------------------------
const finite = (v) => v !== null && Number.isFinite(v);
const DASH = '—';

function fmtPercent(v) {
  return finite(v) ? `${v.toFixed(1)}%` : DASH;
}
// Loss figures are negative; the sign itself is the colorblind-safe direction cue.
function fmtLoss(v) {
  return finite(v) ? `${v.toFixed(1)}%` : DASH;
}
function fmtAbs(v) {
  return finite(v) ? `${Math.abs(v).toFixed(1)}%` : DASH;
}
// Ratios pair an arrow glyph with color so direction survives without color (4B.6).
function fmtRatio(v) {
  if (!finite(v)) return DASH;
  return `${v >= 0 ? '▲' : '▼'} ${v.toFixed(2)}`;
}

function volBucket(vol) {
  if (!finite(vol)) return 'Unknown';
  if (vol < 15) return 'Calm';
  if (vol < 25) return 'Moderate';
  if (vol < 40) return 'Elevated';
  return 'High';
}

// ratio >= 1 is good, < 0 is bad, in between is neutral.
function ratioTone(v) {
  if (!finite(v)) return 'neutral';
  if (v >= 1) return 'good';
  if (v < 0) return 'bad';
  return 'neutral';
}

function fmtNum2(v) {
  return finite(v) ? v.toFixed(2) : DASH;
}
// Signed percent: the +/- sign is the colorblind-safe direction cue (4B.6).
function fmtSignedPct(v) {
  return finite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : DASH;
}
function signedTone(v) {
  if (!finite(v)) return 'neutral';
  if (v > 0) return 'good';
  if (v < 0) return 'bad';
  return 'neutral';
}

// --- tiny presentational pieces (no new deps, reuse chart color tokens) ----

function Sparkline({ values }) {
  if (!values || values.length < 2) return null;
  const W = 120;
  const H = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (v) => H - ((v - min) / (max - min || 1)) * H;
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      className="mt-1 h-6 w-full"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={LAST_PRICE_COLOR}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

Sparkline.propTypes = { values: PropTypes.arrayOf(PropTypes.number) };

// The shared KPI card (Section 4B.3). tone drives value color by *meaning*.
// ⓘ tooltip is a keyboard-reachable <details> (4B.6), not a hover-only title.
function MetricCard({ label, value, gloss, tone = 'neutral', formula, spark }) {
  const neutral = value === DASH || tone === 'neutral';
  const valueColor = neutral
    ? 'text-white'
    : tone === 'bad'
      ? 'text-bloomberg-red'
      : 'text-bloomberg-green';
  return (
    <div className="border border-bloomberg-border bg-bloomberg-card p-3 font-mono">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] tracking-wider text-bloomberg-muted uppercase">{label}</div>
        {formula && (
          <details className="group relative">
            <summary className="cursor-pointer list-none text-bloomberg-muted hover:text-white [&::-webkit-details-marker]:hidden">
              ⓘ
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-56 border border-bloomberg-border bg-black/95 p-2 text-[10px] leading-relaxed text-bloomberg-subtle shadow-lg">
              {formula}
            </div>
          </details>
        )}
      </div>
      <div className={`mt-1 text-2xl ${valueColor}`}>{value}</div>
      {spark && <Sparkline values={spark} />}
      {gloss && (
        <div className="mt-1 text-[11px] leading-relaxed text-bloomberg-subtle">{gloss}</div>
      )}
    </div>
  );
}

MetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  gloss: PropTypes.string,
  tone: PropTypes.oneOf(['neutral', 'good', 'bad']),
  formula: PropTypes.string,
  spark: PropTypes.arrayOf(PropTypes.number),
};

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse border border-bloomberg-border bg-bloomberg-surface"
        />
      ))}
    </div>
  );
}

// Fan chart: shaded p10–p90 band + median line + a few faint sample paths (4B.4).
function FanChart({ band, samplePaths }) {
  const W = 720;
  const H = 240;
  const P = { t: 16, r: 16, b: 8, l: 16 };
  const steps = band.length - 1;
  const min = Math.min(...band.map((b) => b.p10));
  const max = Math.max(...band.map((b) => b.p90));
  const x = (i) => P.l + (i / (steps || 1)) * (W - P.l - P.r);
  const y = (v) => P.t + ((max - v) / (max - min || 1)) * (H - P.t - P.b);
  const line = (vals) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const bandPath = `${band.map((b, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(b.p90).toFixed(1)}`).join(' ')} ${[
    ...band,
  ]
    .map((b, i) => ({ b, i }))
    .reverse()
    .map(({ b, i }) => `L ${x(i).toFixed(1)} ${y(b.p10).toFixed(1)}`)
    .join(' ')} Z`;
  return (
    <svg
      role="img"
      aria-label="Monte Carlo price fan: shaded 10th–90th percentile band with median"
      className="h-[240px] w-full border border-bloomberg-border bg-black"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <path d={bandPath} fill={LAST_PRICE_COLOR} fillOpacity="0.15" stroke="none" />
      {samplePaths.map((p, idx) => (
        <path
          key={idx}
          d={line(p)}
          fill="none"
          stroke={GRID_COLOR}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d={line(band.map((b) => b.p50))}
        fill="none"
        stroke={LAST_PRICE_COLOR}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

FanChart.propTypes = {
  band: PropTypes.arrayOf(PropTypes.object).isRequired,
  samplePaths: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
};

function Histogram({ bins, label }) {
  const W = 720;
  const H = 160;
  const P = { t: 8, r: 8, b: 8, l: 8 };
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const bw = (W - P.l - P.r) / (bins.length || 1);
  return (
    <svg
      role="img"
      aria-label={label}
      className="h-[160px] w-full border border-bloomberg-border bg-black"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      {bins.map((b, i) => {
        const h = (b.count / maxCount) * (H - P.t - P.b);
        return (
          <rect
            key={i}
            x={P.l + i * bw}
            y={H - P.b - h}
            width={Math.max(1, bw - 1)}
            height={h}
            fill={LAST_PRICE_COLOR}
            fillOpacity="0.7"
          />
        );
      })}
    </svg>
  );
}

Histogram.propTypes = {
  bins: PropTypes.arrayOf(PropTypes.object).isRequired,
  label: PropTypes.string.isRequired,
};

// Histogram of returns with a fitted normal curve overlaid (4.2 distribution).
function NormalOverlayHistogram({ bins, mu, sigma, label }) {
  const W = 720;
  const H = 180;
  const P = { t: 8, r: 8, b: 8, l: 8 };
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const total = bins.reduce((a, b) => a + b.count, 0);
  const binW = bins.length ? bins[0].binEnd - bins[0].binStart : 0;
  const bw = (W - P.l - P.r) / (bins.length || 1);
  // Normal pdf scaled to counts: pdf(x) * total * binWidth, then to maxCount px.
  const pdf = (x) =>
    sigma > 0 ? (Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI))) : 0;
  const curve = bins
    .map((b, i) => {
      const mid = (b.binStart + b.binEnd) / 2;
      const count = pdf(mid) * total * binW;
      const h = (count / maxCount) * (H - P.t - P.b);
      return `${i === 0 ? 'M' : 'L'} ${(P.l + i * bw + bw / 2).toFixed(1)} ${(H - P.b - h).toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      role="img"
      aria-label={label}
      className="h-[180px] w-full border border-bloomberg-border bg-black"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      {bins.map((b, i) => {
        const h = (b.count / maxCount) * (H - P.t - P.b);
        return (
          <rect
            key={i}
            x={P.l + i * bw}
            y={H - P.b - h}
            width={Math.max(1, bw - 1)}
            height={h}
            fill={LAST_PRICE_COLOR}
            fillOpacity="0.6"
          />
        );
      })}
      <path d={curve} fill="none" stroke={GRID_COLOR} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

NormalOverlayHistogram.propTypes = {
  bins: PropTypes.arrayOf(PropTypes.object).isRequired,
  mu: PropTypes.number.isRequired,
  sigma: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
};

// Strategy equity vs buy & hold (two lines on a shared y-axis).
function DualLineChart({ a, b, label }) {
  const W = 720;
  const H = 240;
  const P = { t: 12, r: 12, b: 8, l: 12 };
  const all = [...a, ...b];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const x = (i, len) => P.l + (i / (len - 1 || 1)) * (W - P.l - P.r);
  const y = (v) => P.t + ((max - v) / (max - min || 1)) * (H - P.t - P.b);
  const line = (vals) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i, vals.length).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg
      role="img"
      aria-label={label}
      className="h-[240px] w-full border border-bloomberg-border bg-black"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <path d={line(b)} fill="none" stroke={GRID_COLOR} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={line(a)} fill="none" stroke={LAST_PRICE_COLOR} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

DualLineChart.propTypes = {
  a: PropTypes.arrayOf(PropTypes.number).isRequired,
  b: PropTypes.arrayOf(PropTypes.number).isRequired,
  label: PropTypes.string.isRequired,
};

// --- sections -------------------------------------------------------------

function VolatilitySection({ vol, ewma, rollingVols, rollingPoints }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        This stock&apos;s price swings are{' '}
        <span className="text-white">{volBucket(vol).toLowerCase()}</span> — annualized volatility
        is {fmtPercent(vol)}.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Annualized Volatility"
          value={fmtPercent(vol)}
          gloss={`${volBucket(vol)} — how much daily returns spread out, scaled to a year.`}
          formula="Standard deviation of daily simple returns × √252 × 100%. Matches the server-side risk summary."
          spark={rollingVols}
        />
        <MetricCard
          label="EWMA Volatility (recent)"
          value={fmtPercent(ewma)}
          gloss="Recent-weighted volatility — reacts faster to the latest calm or chaos."
          formula="RiskMetrics EWMA: varₜ = 0.94·varₜ₋₁ + 0.06·rₜ², annualized."
        />
      </div>

      <PriceMetricLineChart
        title="Rolling Volatility (21-day)"
        subtitle="Annualized volatility over a sliding one-month window"
        points={rollingPoints}
        valueType="percent"
        emptyMessage="Not enough history for a rolling-volatility chart."
      />
    </div>
  );
}

VolatilitySection.propTypes = {
  vol: PropTypes.number,
  ewma: PropTypes.number,
  rollingVols: PropTypes.arrayOf(PropTypes.number).isRequired,
  rollingPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function RiskSection({
  dd,
  cal,
  histVaR,
  paramVaR,
  cv,
  downDev,
  shp,
  srt,
  bta,
  alf,
  rfPct,
  benchAvailable,
  ddPoints,
  rsPoints,
  rbPoints,
}) {
  const excessLabel = `excess over ${rfPct.toFixed(1)}%`;
  const benchNote = benchAvailable
    ? 'Benchmark: S&P 500 (^GSPC). Approximate for non-US tickers.'
    : 'S&P 500 (^GSPC) benchmark data is unavailable.';
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        On a typical bad day you might lose about{' '}
        <span className="text-bloomberg-red">{fmtAbs(histVaR)}</span> (95% historical VaR); on the
        very worst days, around <span className="text-bloomberg-red">{fmtAbs(cv)}</span> on average.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Max Drawdown"
          value={fmtLoss(dd)}
          tone="bad"
          gloss="Worst peak-to-trough drop over the whole history."
          formula="Largest (price − running peak) / peak across the series. Matches the existing drawdown chart."
        />
        <MetricCard
          label="Historical VaR (95%)"
          value={fmtLoss(histVaR)}
          tone="bad"
          gloss="On 95% of days you lose less than this; only the worst 5% are deeper."
          formula="5th-percentile of actual daily returns. No distribution assumed."
        />
        <MetricCard
          label="Parametric VaR (95%)"
          value={fmtLoss(paramVaR)}
          tone="bad"
          gloss="Same idea, read off a normal bell curve."
          formula="mean − 1.645 × stddev of daily returns. Trusts the bell-curve shape (understates rare crashes)."
        />
        <MetricCard
          label="Conditional VaR (95%)"
          value={fmtLoss(cv)}
          tone="bad"
          gloss="The average loss inside that worst-5% tail."
          formula="Mean of all returns beyond the historical VaR threshold. Always ≥ VaR."
        />
        <MetricCard
          label="Downside Deviation"
          value={fmtPercent(downDev)}
          gloss="Volatility of only the losing days — the swings that actually scare you."
          formula="√(mean of min(0, return)²) × √252 × 100%."
        />
        <MetricCard
          label={`Sharpe (${excessLabel})`}
          value={fmtRatio(shp)}
          tone={ratioTone(shp)}
          gloss="Return per unit of total risk. Higher is a better deal."
          formula={`(mean(returns) − rf) / stddev(returns) × √252. Risk-free rate = ${rfPct.toFixed(1)}% annual.`}
        />
        <MetricCard
          label={`Sortino (${excessLabel})`}
          value={fmtRatio(srt)}
          tone={ratioTone(srt)}
          gloss="Like Sharpe but only penalizes downside risk — fairer to big upside moves."
          formula={`(mean(returns) − rf) / downside-deviation × √252. Risk-free rate = ${rfPct.toFixed(1)}% annual.`}
        />
        <MetricCard
          label="Beta (vs S&P 500)"
          value={fmtNum2(bta)}
          gloss="1.0 moves with the market; above 1 is jumpier, below 1 is calmer."
          formula={`cov(stock, S&P 500) / var(S&P 500), on overlapping trading days. ${benchNote}`}
        />
        <MetricCard
          label="Alpha (annualized)"
          value={fmtSignedPct(alf)}
          tone={signedTone(alf)}
          gloss="Return beyond what beta alone would predict — the 'skill' return vs the market."
          formula={`Jensen's alpha: (stock − rf) − β·(market − rf), annualized. ${benchNote}`}
        />
        <MetricCard
          label="Calmar Ratio"
          value={fmtRatio(cal)}
          tone={ratioTone(cal)}
          gloss="Annual growth per unit of worst drawdown — reward vs the deepest pain."
          formula="CAGR ÷ |max drawdown|. Higher means smoother growth."
        />
      </div>

      <PriceMetricLineChart
        title="Underwater (drawdown) curve"
        subtitle="Percent below the running peak — depth and duration of every dip"
        points={ddPoints}
        valueType="percent"
        emptyMessage="Not enough history for a drawdown chart."
      />

      <PriceMetricLineChart
        title="Rolling Sharpe (63-day)"
        subtitle="Risk-adjusted return over a sliding quarter"
        points={rsPoints}
        valueType="number"
        emptyMessage="Not enough history for a rolling-Sharpe chart."
      />

      <PriceMetricLineChart
        title="Rolling Beta vs S&P 500 (63-day)"
        subtitle={benchAvailable ? 'Market sensitivity over time' : 'Benchmark data unavailable'}
        points={rbPoints}
        valueType="number"
        emptyMessage="Not enough overlapping history for a rolling-beta chart."
      />
    </div>
  );
}

RiskSection.propTypes = {
  dd: PropTypes.number,
  cal: PropTypes.number,
  histVaR: PropTypes.number,
  paramVaR: PropTypes.number,
  cv: PropTypes.number,
  downDev: PropTypes.number,
  shp: PropTypes.number,
  srt: PropTypes.number,
  bta: PropTypes.number,
  alf: PropTypes.number,
  rfPct: PropTypes.number.isRequired,
  benchAvailable: PropTypes.bool.isRequired,
  ddPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
  rsPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
  rbPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
};

function StochasticSection({
  sim,
  spot,
  ccy,
  seed,
  onReroll,
  onSeedChange,
  returnBins,
  horizon,
  onHorizonChange,
  horizonLabel,
  method,
  onMethodChange,
}) {
  const fmtMoney = (v) => `${ccy ? `${ccy} ` : '$'}${Number(v).toFixed(2)}`;
  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {[
          { id: 'gbm', label: 'GBM (normal)' },
          { id: 'bootstrap', label: 'Bootstrap (fat tails)' },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onMethodChange(m.id)}
            className={`rounded-none border px-2.5 py-1 text-[11px] tracking-wide ${
              method === m.id
                ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {MC_HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onHorizonChange(h)}
            className={`rounded-none border px-2 py-1 text-[11px] tracking-wide ${
              horizon === h
                ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
            }`}
          >
            {h}d
          </button>
        ))}
      </div>
    </div>
  );
  if (!sim) {
    return (
      <div className="space-y-4">
        {controls}
        <NoticeBox title="Stochastic">Not enough price history to simulate.</NoticeBox>
      </div>
    );
  }
  const { percentiles, band, samplePaths, terminal } = sim;
  return (
    <div className="space-y-4">
      {controls}
      <p className="text-sm text-bloomberg-subtle">
        In 80% of {MC_PATHS.toLocaleString()} {method === 'bootstrap' ? 'bootstrap' : 'GBM'}{' '}
        simulations, the price in {horizonLabel} landed between{' '}
        <span className="text-white">{fmtMoney(percentiles.p10)}</span> and{' '}
        <span className="text-white">{fmtMoney(percentiles.p90)}</span> (median{' '}
        <span className="text-white">{fmtMoney(percentiles.p50)}</span>). Today: {fmtMoney(spot)}.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onReroll}
          className="rounded-full border border-bloomberg-border px-3 py-1 text-xs tracking-wide text-bloomberg-muted hover:text-white"
        >
          🎲 Re-roll
        </button>
        <label className="text-[11px] text-bloomberg-muted">
          seed{' '}
          <input
            type="number"
            value={seed}
            onChange={(e) => onSeedChange(Number(e.target.value))}
            className="w-20 border border-bloomberg-border bg-black px-1 py-0.5 font-mono text-xs text-white"
          />
        </label>
        <span className="text-[11px] text-bloomberg-subtle">
          Same seed → same simulation. One possible future, not a prediction.
        </span>
      </div>

      <FanChart band={band} samplePaths={samplePaths} />

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="10th pct (downside)" value={fmtMoney(percentiles.p10)} tone="bad" />
        <MetricCard label="Median outcome" value={fmtMoney(percentiles.p50)} />
        <MetricCard label="90th pct (upside)" value={fmtMoney(percentiles.p90)} tone="good" />
      </div>

      <div className="space-y-1">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
          Simulated price distribution
        </div>
        <Histogram
          bins={returnHistogram(terminal, 30)}
          label={`Histogram of simulated ${horizonLabel} prices`}
        />
      </div>

      <div className="space-y-1">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
          Historical daily return distribution
        </div>
        <Histogram bins={returnBins} label="Histogram of historical daily returns" />
      </div>
    </div>
  );
}

StochasticSection.propTypes = {
  sim: PropTypes.object,
  spot: PropTypes.number,
  ccy: PropTypes.string,
  seed: PropTypes.number.isRequired,
  onReroll: PropTypes.func.isRequired,
  onSeedChange: PropTypes.func.isRequired,
  returnBins: PropTypes.arrayOf(PropTypes.object).isRequired,
  horizon: PropTypes.number.isRequired,
  onHorizonChange: PropTypes.func.isRequired,
  horizonLabel: PropTypes.string.isRequired,
  method: PropTypes.oneOf(['gbm', 'bootstrap']).isRequired,
  onMethodChange: PropTypes.func.isRequired,
};

// --- new sections (Phase 4) -----------------------------------------------

function DistributionSection({ skew, kurt, var95, var99, bins, mu, sigma }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        Daily returns are {finite(skew) && skew < -0.1 ? 'left-skewed (crash-prone)' : finite(skew) && skew > 0.1 ? 'right-skewed' : 'roughly symmetric'}
        {finite(kurt) && kurt > 1 ? ' with fat tails — big moves happen more often than a bell curve predicts.' : '.'}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Skewness"
          value={fmtNum2(skew)}
          tone={signedTone(skew)}
          gloss="Negative = longer left (loss) tail; positive = longer right (gain) tail."
          formula="Third standardized moment of daily returns."
        />
        <MetricCard
          label="Excess Kurtosis"
          value={fmtNum2(kurt)}
          tone={finite(kurt) && kurt > 1 ? 'bad' : 'neutral'}
          gloss="0 = normal tails; higher = fatter tails / more outliers."
          formula="Fourth standardized moment − 3."
        />
        <MetricCard
          label="Historical VaR (95%)"
          value={fmtLoss(var95)}
          tone="bad"
          gloss="Worst 1-in-20-day loss."
          formula="5th-percentile daily return."
        />
        <MetricCard
          label="Historical VaR (99%)"
          value={fmtLoss(var99)}
          tone="bad"
          gloss="Worst 1-in-100-day loss — deeper tail risk."
          formula="1st-percentile daily return."
        />
      </div>
      <div className="space-y-1">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
          Daily returns vs fitted normal
        </div>
        <NormalOverlayHistogram
          bins={bins}
          mu={mu}
          sigma={sigma}
          label="Histogram of daily returns with a fitted normal overlay"
        />
      </div>
    </div>
  );
}

DistributionSection.propTypes = {
  skew: PropTypes.number,
  kurt: PropTypes.number,
  var95: PropTypes.number,
  var99: PropTypes.number,
  bins: PropTypes.arrayOf(PropTypes.object).isRequired,
  mu: PropTypes.number.isRequired,
  sigma: PropTypes.number.isRequired,
};

function BacktestSection({ strategy, onStrategyChange, params, onParamChange, result }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        Canned long/flat strategies on this price series, compared to buy &amp; hold. No fees or
        slippage — a sanity check, not a trading system.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStrategyChange(s.id)}
              className={`rounded-none border px-2.5 py-1 text-[11px] tracking-wide ${
                strategy === s.id
                  ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                  : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {strategy === 'sma' && (
          <>
            <SliderField label="Fast SMA" value={params.fast} min={5} max={50} onChange={(v) => onParamChange('fast', v)} />
            <SliderField label="Slow SMA" value={params.slow} min={20} max={200} onChange={(v) => onParamChange('slow', v)} />
          </>
        )}
        {strategy === 'momentum' && (
          <SliderField label="Lookback (days)" value={params.lookback} min={10} max={200} onChange={(v) => onParamChange('lookback', v)} />
        )}
        {strategy === 'meanrev' && (
          <SliderField label="SMA window" value={params.lookback} min={5} max={100} onChange={(v) => onParamChange('lookback', v)} />
        )}
      </div>
      {!result ? (
        <NoticeBox title="Backtest">Not enough price history to backtest.</NoticeBox>
      ) : (
        <>
          <DualLineChart
            a={result.equity}
            b={result.buyhold}
            label="Strategy equity (orange) vs buy & hold (grey)"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Strategy Return" value={fmtSignedPct(result.finalReturn)} tone={signedTone(result.finalReturn)} />
            <MetricCard label="Buy & Hold" value={fmtSignedPct(result.buyHoldReturn)} tone={signedTone(result.buyHoldReturn)} />
            <MetricCard label="CAGR" value={fmtSignedPct(result.cagr)} tone={signedTone(result.cagr)} />
            <MetricCard label="Sharpe" value={fmtRatio(result.sharpe)} tone={ratioTone(result.sharpe)} />
            <MetricCard label="Max Drawdown" value={fmtLoss(result.maxDD)} tone="bad" />
            <MetricCard label="Win Rate" value={fmtPercent(result.winRate)} />
          </div>
          <p className="text-[11px] text-bloomberg-subtle">
            Time in market: {fmtPercent(result.exposure)}.
          </p>
        </>
      )}
    </div>
  );
}

BacktestSection.propTypes = {
  strategy: PropTypes.string.isRequired,
  onStrategyChange: PropTypes.func.isRequired,
  params: PropTypes.object.isRequired,
  onParamChange: PropTypes.func.isRequired,
  result: PropTypes.object,
};

function SliderField({ label, value, min, max, onChange }) {
  return (
    <label className="flex flex-col gap-1 font-mono text-[11px] text-bloomberg-muted">
      <span className="tracking-wider uppercase">
        {label}: <span className="text-white">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-44 accent-bloomberg-orange"
      />
    </label>
  );
}

SliderField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  onChange: PropTypes.func.isRequired,
};

function SizingSection({ kelly, volWeight, vol, regime, hurstVal }) {
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

// Always-visible headline strip (vol / Sharpe / max DD / VaR + regime + Hurst).
function HeadlineStrip({ vol, shp, dd, var95, regime, hurstVal }) {
  const item = (label, value, tone) => (
    <div className="flex flex-col">
      <span className="text-[10px] tracking-wider text-bloomberg-muted uppercase">{label}</span>
      <span
        className={`text-sm ${
          tone === 'bad' ? 'text-bloomberg-red' : tone === 'good' ? 'text-bloomberg-green' : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 border border-bloomberg-border bg-bloomberg-card px-4 py-2">
      {item('Ann. Vol', fmtPercent(vol))}
      {item('Sharpe', fmtRatio(shp), ratioTone(shp))}
      {item('Max DD', fmtLoss(dd), 'bad')}
      {item('VaR 95%', fmtLoss(var95), 'bad')}
      {item('Regime', regime.label, regime.tone)}
      {item('Hurst', `${fmtNum2(hurstVal)} ${hurstLabel(hurstVal)}`)}
    </div>
  );
}

HeadlineStrip.propTypes = {
  vol: PropTypes.number,
  shp: PropTypes.number,
  dd: PropTypes.number,
  var95: PropTypes.number,
  regime: PropTypes.shape({ label: PropTypes.string, tone: PropTypes.string }).isRequired,
  hurstVal: PropTypes.number,
};

// Correlation heatmap: green = positive, red = negative, opacity = magnitude.
function CorrHeatmap({ symbols, matrix }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse font-mono text-[10px]">
        <thead>
          <tr>
            <th className="p-1" />
            {symbols.map((s) => (
              <th key={s} className="p-1 text-bloomberg-muted uppercase">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((rowSym, i) => (
            <tr key={rowSym}>
              <td className="p-1 text-right text-bloomberg-muted uppercase">{rowSym}</td>
              {symbols.map((colSym, j) => {
                const c = matrix[i][j];
                const bg = !finite(c)
                  ? 'transparent'
                  : c >= 0
                    ? `rgba(34,197,94,${Math.abs(c).toFixed(2)})`
                    : `rgba(239,68,68,${Math.abs(c).toFixed(2)})`;
                return (
                  <td
                    key={colSym}
                    className="border border-bloomberg-border px-2 py-1 text-center text-white"
                    style={{ backgroundColor: bg }}
                  >
                    {finite(c) ? c.toFixed(2) : DASH}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

CorrHeatmap.propTypes = {
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  matrix: PropTypes.arrayOf(PropTypes.array).isRequired,
};

// Efficient-frontier scatter with GMV + tangency portfolios marked.
function FrontierChart({ frontier, gmv, tangency }) {
  const W = 720;
  const H = 260;
  const P = { t: 16, r: 16, b: 28, l: 40 };
  const pts = [...frontier, gmv, tangency].filter(Boolean);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.vol);
  const ys = pts.map((p) => p.ret);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const x = (v) => P.l + ((v - minX) / (maxX - minX || 1)) * (W - P.l - P.r);
  const y = (v) => P.t + ((maxY - v) / (maxY - minY || 1)) * (H - P.t - P.b);
  const path = frontier
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.vol).toFixed(1)} ${y(p.ret).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      role="img"
      aria-label="Efficient frontier: annualized return vs volatility"
      className="h-[260px] w-full border border-bloomberg-border bg-black"
      viewBox={`0 0 ${W} ${H}`}
    >
      <path d={path} fill="none" stroke={LAST_PRICE_COLOR} strokeWidth="1.5" />
      {gmv && <circle cx={x(gmv.vol)} cy={y(gmv.ret)} r="4" fill="#3b82f6" />}
      {tangency && <circle cx={x(tangency.vol)} cy={y(tangency.ret)} r="4" fill="#22c55e" />}
      <text x={P.l} y={H - 8} className="fill-bloomberg-muted text-[9px]">
        vol % →
      </text>
      <text x={4} y={P.t} className="fill-bloomberg-muted text-[9px]">
        ret %
      </text>
    </svg>
  );
}

FrontierChart.propTypes = {
  frontier: PropTypes.arrayOf(PropTypes.object).isRequired,
  gmv: PropTypes.object,
  tangency: PropTypes.object,
};

function WeightsTable({ title, symbols, weights, color }) {
  if (!weights) return null;
  return (
    <div className="border border-bloomberg-border bg-bloomberg-card p-3">
      <div className="mb-1 flex items-center gap-2 text-[11px] tracking-wider uppercase" style={{ color }}>
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </div>
      <table className="w-full font-mono text-[11px]">
        <tbody>
          {symbols.map((s, i) => (
            <tr key={s}>
              <td className="py-0.5 text-bloomberg-muted uppercase">{s}</td>
              <td className="py-0.5 text-right text-white">{(weights[i] * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

WeightsTable.propTypes = {
  title: PropTypes.string.isRequired,
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  weights: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.string.isRequired,
};

function CorrelationSection({
  peerInput,
  onPeerInputChange,
  onAddPeers,
  peers,
  onRemovePeer,
  loading,
  symbols,
  matrix,
  rollPoints,
  rollLabel,
  frontier,
  gmv,
  tangency,
  gmvWeights: gmvW,
  tangencyWeights: tanW,
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        Add peer tickers to see how this name co-moves with them, and a quick mean-variance
        optimization over the basket. Each peer is one extra price fetch (1Y daily). Weights are
        unconstrained — they can go short (negative).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={peerInput}
          onChange={(e) => onPeerInputChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && onAddPeers()}
          placeholder="Add peers e.g. MSFT, NVDA"
          className="h-8 w-56 border border-bloomberg-border bg-black px-2 font-mono text-xs tracking-wider text-white placeholder:text-bloomberg-muted"
        />
        <button
          type="button"
          onClick={onAddPeers}
          className="h-8 rounded-none border border-bloomberg-border px-3 font-mono text-[11px] tracking-wider text-bloomberg-muted hover:text-white"
        >
          Add
        </button>
        {loading && <span className="font-mono text-[11px] text-bloomberg-amber">FETCHING…</span>}
      </div>

      {peers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {peers.map((p) => (
            <button
              key={p.symbol}
              type="button"
              onClick={() => onRemovePeer(p.symbol)}
              className="rounded-full border border-bloomberg-border px-2 py-0.5 font-mono text-[11px] text-bloomberg-muted hover:text-bloomberg-red"
            >
              {p.symbol} ✕
            </button>
          ))}
        </div>
      )}

      {symbols.length < 2 ? (
        <NoticeBox title="Correlation">Add at least one peer ticker to compute correlations.</NoticeBox>
      ) : (
        <>
          <div className="space-y-1">
            <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
              Correlation matrix (daily returns, common days)
            </div>
            <CorrHeatmap symbols={symbols} matrix={matrix} />
          </div>

          <PriceMetricLineChart
            title={`Rolling correlation (63-day) — ${rollLabel}`}
            subtitle="How the pair's co-movement drifts over time"
            points={rollPoints}
            valueType="number"
            emptyMessage="Not enough overlapping history for a rolling-correlation chart."
          />

          <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
            Mean-variance optimizer
          </div>
          {frontier.length === 0 ? (
            <NoticeBox title="Optimizer">
              Covariance is singular for this basket — try different or fewer peers.
            </NoticeBox>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
              <FrontierChart frontier={frontier} gmv={gmv} tangency={tangency} />
              <div className="space-y-3">
                <WeightsTable title="Min-Variance" symbols={symbols} weights={gmvW} color="#3b82f6" />
                <WeightsTable title="Max-Sharpe" symbols={symbols} weights={tanW} color="#22c55e" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

CorrelationSection.propTypes = {
  peerInput: PropTypes.string.isRequired,
  onPeerInputChange: PropTypes.func.isRequired,
  onAddPeers: PropTypes.func.isRequired,
  peers: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRemovePeer: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  matrix: PropTypes.arrayOf(PropTypes.array).isRequired,
  rollPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
  rollLabel: PropTypes.string.isRequired,
  frontier: PropTypes.arrayOf(PropTypes.object).isRequired,
  gmv: PropTypes.object,
  tangency: PropTypes.object,
  gmvWeights: PropTypes.arrayOf(PropTypes.number),
  tangencyWeights: PropTypes.arrayOf(PropTypes.number),
};

// --- main -----------------------------------------------------------------

function QuantPanel({ points, currency, symbol }) {
  const [section, setSection] = useState('volatility');
  const [seed, setSeed] = useState(42);
  const [rf, setRf] = useState(0); // annual risk-free rate as a fraction
  const [benchPoints, setBenchPoints] = useState(null); // null = loading, [] = unavailable
  const [mcHorizon, setMcHorizon] = useState(MC_DAYS);
  const [mcMethod, setMcMethod] = useState('gbm'); // 'gbm' | 'bootstrap'
  const [strategy, setStrategy] = useState('sma');
  const [btParams, setBtParams] = useState({ fast: 20, slow: 50, lookback: 60 });
  const [peerInput, setPeerInput] = useState('');
  const [peers, setPeers] = useState([]); // [{ symbol, points }]
  const [peerLoading, setPeerLoading] = useState(false);

  const closes = useMemo(() => points.map((p) => p.adjusted_close ?? p.close), [points]);
  const ccy = currency || '';
  const rfDaily = rf / TRADING_DAYS;

  // On-demand: pull the risk-free rate (config) and the ^GSPC benchmark series
  // only when the tab mounts. Both fail soft — rf falls back to 0, beta/alpha to —.
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    getApiStatus({ signal: controller.signal })
      .then((s) => {
        if (alive && Number.isFinite(s?.quant_risk_free_rate)) setRf(s.quant_risk_free_rate);
      })
      .catch(() => {});
    getMarketOhlcv(BENCHMARK_SYMBOL, { range: '1Y', signal: controller.signal })
      .then((p) => {
        if (alive) setBenchPoints(Array.isArray(p?.points) ? p.points : []);
      })
      .catch(() => {
        if (alive) setBenchPoints([]);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const returns = useMemo(() => simpleReturns(closes), [closes]);
  const logRet = useMemo(() => logReturns(closes), [closes]);
  const rollingVols = useMemo(() => rollingVol(closes, ROLLING_WINDOW), [closes]);

  const rollingPoints = useMemo(
    () =>
      rollingVols
        .map((value, m) => ({ date: String(points[ROLLING_WINDOW + m]?.date || ''), value }))
        .filter((p) => p.date),
    [rollingVols, points]
  );

  const metrics = useMemo(
    () => ({
      vol: annualizedVol(closes),
      ewma: ewmaVol(closes),
      dd: maxDrawdown(closes),
      cal: calmar(closes),
      histVaR: historicalVaR(returns),
      paramVaR: parametricVaR(returns),
      cv: cvar(returns),
      downDev: downsideDeviation(returns),
      shp: sharpe(returns, rfDaily),
      srt: sortino(returns, rfDaily),
      skew: skewness(returns),
      kurt: kurtosis(returns),
      var95: historicalVaR(returns, 0.95),
      var99: historicalVaR(returns, 0.99),
      kelly: kellyFraction(returns),
    }),
    [closes, returns, rfDaily]
  );

  // Regime (vol percentile) + Hurst (trend vs mean-revert) for the headline + sizing.
  const regime = useMemo(() => regimeLabel(volPercentile(rollingVols)), [rollingVols]);
  const hurstVal = useMemo(() => hurst(returns), [returns]);

  // Underwater curve, zipped to dates (drops the first point — no prior peak).
  const ddPoints = useMemo(
    () =>
      drawdownSeries(closes)
        .map((value, i) => ({ date: String(points[i]?.date || ''), value }))
        .filter((p) => p.date),
    [closes, points]
  );

  // Rolling Sharpe zipped to dates (window offset + 1 for the returns→price shift).
  const rsPoints = useMemo(
    () =>
      rollingSharpe(returns, ROLLING_RATIO_WINDOW, rfDaily)
        .map((value, m) => ({ date: String(points[ROLLING_RATIO_WINDOW + m]?.date || ''), value }))
        .filter((p) => p.date && Number.isFinite(p.value)),
    [returns, points, rfDaily]
  );

  // Benchmark-relative metrics + rolling beta from the aligned ^GSPC series.
  const benchmark = useMemo(() => {
    if (!benchPoints || benchPoints.length === 0)
      return { beta: null, alpha: null, available: false, rollBeta: [] };
    const { stock, market } = alignByDate(points, benchPoints);
    if (stock.length < 3) return { beta: null, alpha: null, available: false, rollBeta: [] };
    const sr = simpleReturns(stock);
    const mr = simpleReturns(market);
    return {
      beta: beta(sr, mr),
      alpha: alpha(sr, mr, rfDaily),
      available: true,
      rollBeta: rollingBeta(sr, mr, ROLLING_RATIO_WINDOW),
    };
  }, [points, benchPoints, rfDaily]);

  // Rolling beta has no clean date axis (aligned days differ), so index it.
  const rbPoints = useMemo(
    () =>
      benchmark.rollBeta
        .map((value, i) => ({ date: String(i + 1), value }))
        .filter((p) => Number.isFinite(p.value)),
    [benchmark.rollBeta]
  );

  // Only run the simulation when the section is open and there's enough data;
  // keyed so unrelated re-renders (e.g. streaming updates) don't re-roll it.
  const sim = useMemo(() => {
    if (section !== 'stochastic' || closes.length < 30) return null;
    const spot = closes.at(-1);
    if (mcMethod === 'bootstrap') {
      return bootstrapMC(spot, returns, mcHorizon, MC_PATHS, seed);
    }
    return monteCarloGBM(spot, mean(logRet), stdDev(logRet), mcHorizon, MC_PATHS, seed);
  }, [section, closes, logRet, returns, seed, mcHorizon, mcMethod]);

  const horizonLabel = useMemo(() => {
    const months = Math.round((mcHorizon / TRADING_DAYS) * 12);
    return months >= 12 ? `~${Math.round(months / 12)}y` : `~${months}mo`;
  }, [mcHorizon]);

  const backtestResult = useMemo(() => {
    if (section !== 'backtest') return null;
    return backtest(closes, strategy, btParams);
  }, [section, closes, strategy, btParams]);

  const returnBins = useMemo(() => returnHistogram(returns, 30), [returns]);
  const volWeight = useMemo(() => volTargetWeight(metrics.vol, VOL_TARGET), [metrics.vol]);

  // --- correlation + optimizer (Phase 5) ----------------------------------
  const baseSymbol = (symbol || 'BASE').toUpperCase();

  const addPeers = useCallback(() => {
    const wanted = peerInput
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .filter((s) => s !== baseSymbol);
    if (wanted.length === 0) return;
    setPeerLoading(true);
    Promise.allSettled(
      wanted.map((sym) =>
        getMarketOhlcv(sym, { range: '1Y' }).then((res) => ({
          symbol: sym,
          points: Array.isArray(res?.points) ? res.points : [],
        }))
      )
    )
      .then((results) => {
        const fetched = results
          .filter((r) => r.status === 'fulfilled' && r.value.points.length > 0)
          .map((r) => r.value);
        setPeers((prev) => {
          const have = new Set(prev.map((p) => p.symbol));
          return [...prev, ...fetched.filter((p) => !have.has(p.symbol))];
        });
        setPeerInput('');
      })
      .finally(() => setPeerLoading(false));
  }, [peerInput, baseSymbol]);

  const removePeer = useCallback(
    (sym) => setPeers((prev) => prev.filter((p) => p.symbol !== sym)),
    []
  );

  // Align base + peers on common days; compute correlation matrix + optimizer.
  const corr = useMemo(() => {
    const empty = {
      symbols: [],
      matrix: [],
      frontier: [],
      gmv: null,
      tangency: null,
      gmvW: null,
      tanW: null,
      rollPoints: [],
      rollLabel: '',
    };
    if (peers.length === 0 || section !== 'correlation') return empty;
    const series = [{ symbol: baseSymbol, points }, ...peers];
    const { dates, closes } = alignManyByDate(series);
    if (dates.length < 30) return empty;
    const symbols = series.map((s) => s.symbol);
    const retBySym = {};
    symbols.forEach((s) => {
      retBySym[s] = simpleReturns(closes[s]);
    });
    const matrix = correlationMatrix(symbols, retBySym);
    const retList = symbols.map((s) => retBySym[s]);
    const cov = covarianceMatrix(retList);
    const mu = retList.map(mean);
    const gmvW = gmvWeights(cov);
    const tanW = tangencyWeights(cov, mu, rfDaily);
    const frontier = efficientFrontier(cov, mu, rfDaily);
    const annualize = (w) => {
      if (!w) return null;
      const { ret, vol } = portfolioStats(w, mu, cov);
      return { ret: ret * TRADING_DAYS * 100, vol: vol * Math.sqrt(TRADING_DAYS) * 100 };
    };
    // Rolling correlation: base vs the first peer.
    const peerSym = symbols[1];
    const roll = rollingCorrelation(retBySym[baseSymbol], retBySym[peerSym], ROLLING_RATIO_WINDOW);
    const rollPoints = roll
      .map((value, i) => ({ date: String(dates[ROLLING_RATIO_WINDOW + 1 + i] || ''), value }))
      .filter((p) => p.date && Number.isFinite(p.value));
    return {
      symbols,
      matrix,
      frontier,
      gmv: annualize(gmvW),
      tangency: annualize(tanW),
      gmvW,
      tanW,
      rollPoints,
      rollLabel: `${baseSymbol} vs ${peerSym}`,
    };
  }, [peers, section, baseSymbol, points, rfDaily]);

  // Loading: result is here but price history hasn't streamed in yet.
  // ponytail: 0 points = still loading; 1–29 = genuinely too short (NoticeBox).
  if (closes.length === 0) return <SkeletonGrid />;

  if (closes.length < 30) {
    return (
      <div className="p-4">
        <NoticeBox title="Not enough data">
          Quant statistics need at least 30 trading days of price history.
        </NoticeBox>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 font-mono">
      <HeadlineStrip
        vol={metrics.vol}
        shp={metrics.shp}
        dd={metrics.dd}
        var95={metrics.var95}
        regime={regime}
        hurstVal={hurstVal}
      />

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            className={`rounded-full border border-bloomberg-border px-3 py-1 text-xs tracking-wide ${
              section === s.id
                ? 'bg-bloomberg-orange text-black'
                : 'text-bloomberg-muted hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'volatility' && (
        <VolatilitySection
          vol={metrics.vol}
          ewma={metrics.ewma}
          rollingVols={rollingVols}
          rollingPoints={rollingPoints}
        />
      )}

      {section === 'risk' && (
        <RiskSection
          dd={metrics.dd}
          cal={metrics.cal}
          histVaR={metrics.histVaR}
          paramVaR={metrics.paramVaR}
          cv={metrics.cv}
          downDev={metrics.downDev}
          shp={metrics.shp}
          srt={metrics.srt}
          bta={benchmark.beta}
          alf={benchmark.alpha}
          rfPct={rf * 100}
          benchAvailable={benchmark.available}
          ddPoints={ddPoints}
          rsPoints={rsPoints}
          rbPoints={rbPoints}
        />
      )}

      {section === 'distribution' && (
        <DistributionSection
          skew={metrics.skew}
          kurt={metrics.kurt}
          var95={metrics.var95}
          var99={metrics.var99}
          bins={returnBins}
          mu={mean(returns)}
          sigma={stdDev(returns)}
        />
      )}

      {section === 'stochastic' && (
        <StochasticSection
          sim={sim}
          spot={closes.at(-1)}
          ccy={ccy}
          seed={seed}
          onReroll={() => setSeed((s) => (s + 1) >>> 0)}
          onSeedChange={(v) => setSeed(Number.isFinite(v) ? v : 0)}
          returnBins={returnBins}
          horizon={mcHorizon}
          onHorizonChange={setMcHorizon}
          horizonLabel={horizonLabel}
          method={mcMethod}
          onMethodChange={setMcMethod}
        />
      )}

      {section === 'backtest' && (
        <BacktestSection
          strategy={strategy}
          onStrategyChange={setStrategy}
          params={btParams}
          onParamChange={(k, v) => setBtParams((prev) => ({ ...prev, [k]: v }))}
          result={backtestResult}
        />
      )}

      {section === 'sizing' && (
        <SizingSection
          kelly={metrics.kelly}
          volWeight={volWeight}
          vol={metrics.vol}
          regime={regime}
          hurstVal={hurstVal}
        />
      )}

      {section === 'correlation' && (
        <CorrelationSection
          peerInput={peerInput}
          onPeerInputChange={setPeerInput}
          onAddPeers={addPeers}
          peers={peers}
          onRemovePeer={removePeer}
          loading={peerLoading}
          symbols={corr.symbols}
          matrix={corr.matrix}
          rollPoints={corr.rollPoints}
          rollLabel={corr.rollLabel}
          frontier={corr.frontier}
          gmv={corr.gmv}
          tangency={corr.tangency}
          gmvWeights={corr.gmvW}
          tangencyWeights={corr.tanW}
        />
      )}
    </div>
  );
}

QuantPanel.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  currency: PropTypes.string,
  symbol: PropTypes.string,
};

export default memo(QuantPanel);
