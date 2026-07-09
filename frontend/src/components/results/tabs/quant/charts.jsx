import PropTypes from 'prop-types';

import { GRID_COLOR, LAST_PRICE_COLOR } from '../priceChartUtils';
import { DASH } from './format';

// --- tiny presentational pieces (no new deps, reuse chart color tokens) ----

export function Sparkline({ values }) {
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
export function MetricCard({ label, value, gloss, tone = 'neutral', formula, spark }) {
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

export function SkeletonGrid() {
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
export function FanChart({ band, samplePaths }) {
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

export function Histogram({ bins, label }) {
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
export function NormalOverlayHistogram({ bins, mu, sigma, label }) {
  const W = 720;
  const H = 180;
  const P = { t: 8, r: 8, b: 8, l: 8 };
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const total = bins.reduce((a, b) => a + b.count, 0);
  const binW = bins.length ? bins[0].binEnd - bins[0].binStart : 0;
  const bw = (W - P.l - P.r) / (bins.length || 1);
  // Normal pdf scaled to counts: pdf(x) * total * binWidth, then to maxCount px.
  const pdf = (x) =>
    sigma > 0
      ? Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI))
      : 0;
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
      <path
        d={curve}
        fill="none"
        stroke={GRID_COLOR}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
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
export function DualLineChart({ a, b, label }) {
  const W = 720;
  const H = 240;
  const P = { t: 12, r: 12, b: 8, l: 12 };
  const all = [...a, ...b];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const x = (i, len) => P.l + (i / (len - 1 || 1)) * (W - P.l - P.r);
  const y = (v) => P.t + ((max - v) / (max - min || 1)) * (H - P.t - P.b);
  const line = (vals) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i, vals.length).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(' ');
  return (
    <svg
      role="img"
      aria-label={label}
      className="h-[240px] w-full border border-bloomberg-border bg-black"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
    >
      <path
        d={line(b)}
        fill="none"
        stroke={GRID_COLOR}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={line(a)}
        fill="none"
        stroke={LAST_PRICE_COLOR}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

DualLineChart.propTypes = {
  a: PropTypes.arrayOf(PropTypes.number).isRequired,
  b: PropTypes.arrayOf(PropTypes.number).isRequired,
  label: PropTypes.string.isRequired,
};

export function SliderField({ label, value, min, max, onChange }) {
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

export function NumberField({ label, value, onChange, step = 'any', suffix }) {
  return (
    <label className="flex flex-col gap-1 font-mono text-[11px] text-bloomberg-muted">
      <span className="tracking-wider uppercase">
        {label}
        {suffix ? ` (${suffix})` : ''}
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className="w-32 border border-bloomberg-border bg-black px-2 py-1 text-white accent-bloomberg-orange"
      />
    </label>
  );
}

NumberField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  onChange: PropTypes.func.isRequired,
  step: PropTypes.string,
  suffix: PropTypes.string,
};

// Black-Scholes-Merton option pricer + Greeks. Spot is the last close; vol/rate

export function SectionBlock({ title, hidden, children }) {
  return (
    <section role="tabpanel" hidden={hidden} className="space-y-3">
      <h2 className="border-b border-bloomberg-border pb-1 text-xs font-bold tracking-[0.2em] text-bloomberg-orange uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

SectionBlock.propTypes = {
  title: PropTypes.string.isRequired,
  hidden: PropTypes.bool,
  children: PropTypes.node.isRequired,
};

// --- main -----------------------------------------------------------------
