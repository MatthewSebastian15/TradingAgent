import PropTypes from 'prop-types';

import { LAST_PRICE_COLOR } from '../priceChartUtils';
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
export function MetricCard({ label, value, gloss, tone = 'neutral', formula, spark, sample }) {
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
      <div className={`mt-1 text-2xl tabular-nums ${valueColor}`}>{value}</div>
      {sample && <div className="mt-0.5 text-[10px] text-bloomberg-white/80">{sample}</div>}
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
  sample: PropTypes.string,
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
