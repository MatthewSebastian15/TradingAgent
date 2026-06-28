import PropTypes from 'prop-types';
import { memo, useMemo, useState } from 'react';

import NoticeBox from '../NoticeBox';
import { GRID_COLOR, LAST_PRICE_COLOR } from './priceChartUtils';
import PriceMetricLineChart from './PriceMetricLineChart';
import {
  annualizedVol,
  cvar,
  downsideDeviation,
  ewmaVol,
  historicalVaR,
  logReturns,
  maxDrawdown,
  mean,
  monteCarloGBM,
  parametricVaR,
  returnHistogram,
  rollingVol,
  sharpe,
  simpleReturns,
  sortino,
  stdDev,
} from './quantUtils';

const ROLLING_WINDOW = 21;
const MC_PATHS = 5000; // perf cap (Section 4.5)
const MC_DAYS = 126; // ~6 months

const SECTIONS = [
  { id: 'volatility', label: 'Volatility' },
  { id: 'risk', label: 'Risk' },
  { id: 'stochastic', label: 'Stochastic' },
];

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

function RiskSection({ dd, histVaR, paramVaR, cv, downDev, shp, srt }) {
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
          label="Sharpe (excess over 0%)"
          value={fmtRatio(shp)}
          tone={ratioTone(shp)}
          gloss="Return per unit of total risk. Higher is a better deal."
          formula="mean(returns) / stddev(returns) × √252. v1 uses risk-free rate = 0, so this is excess over 0%."
        />
        <MetricCard
          label="Sortino (excess over 0%)"
          value={fmtRatio(srt)}
          tone={ratioTone(srt)}
          gloss="Like Sharpe but only penalizes downside risk — fairer to big upside moves."
          formula="mean(returns) / downside-deviation × √252. v1 uses risk-free rate = 0."
        />
      </div>
    </div>
  );
}

RiskSection.propTypes = {
  dd: PropTypes.number,
  histVaR: PropTypes.number,
  paramVaR: PropTypes.number,
  cv: PropTypes.number,
  downDev: PropTypes.number,
  shp: PropTypes.number,
  srt: PropTypes.number,
};

function StochasticSection({ sim, spot, ccy, seed, onReroll, onSeedChange, returnBins }) {
  const fmtMoney = (v) => `${ccy ? `${ccy} ` : '$'}${Number(v).toFixed(2)}`;
  if (!sim) {
    return <NoticeBox title="Stochastic">Not enough price history to simulate.</NoticeBox>;
  }
  const { percentiles, band, samplePaths, terminal } = sim;
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        In 80% of {MC_PATHS.toLocaleString()} simulations, the price in ~6 months landed between{' '}
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
          label="Histogram of simulated 6-month prices"
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
};

// --- main -----------------------------------------------------------------

function QuantTab({ result }) {
  const [section, setSection] = useState('volatility');
  const [seed, setSeed] = useState(42);

  const points = useMemo(() => result?.price_chart?.points ?? [], [result]);
  const closes = useMemo(() => points.map((p) => p.adjusted_close ?? p.close), [points]);
  const ccy = result?.price_chart?.currency || result?.currency || '';

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
      histVaR: historicalVaR(returns),
      paramVaR: parametricVaR(returns),
      cv: cvar(returns),
      downDev: downsideDeviation(returns),
      shp: sharpe(returns),
      srt: sortino(returns),
    }),
    [closes, returns]
  );

  // Only run the simulation when the section is open and there's enough data;
  // keyed so unrelated re-renders (e.g. streaming updates) don't re-roll it.
  const sim = useMemo(() => {
    if (section !== 'stochastic' || closes.length < 30) return null;
    return monteCarloGBM(closes.at(-1), mean(logRet), stdDev(logRet), MC_DAYS, MC_PATHS, seed);
  }, [section, closes, logRet, seed]);

  const returnBins = useMemo(() => returnHistogram(returns, 30), [returns]);

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
          histVaR={metrics.histVaR}
          paramVaR={metrics.paramVaR}
          cv={metrics.cv}
          downDev={metrics.downDev}
          shp={metrics.shp}
          srt={metrics.srt}
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
        />
      )}
    </div>
  );
}

QuantTab.propTypes = { result: PropTypes.object.isRequired };

export default memo(QuantTab);
