import { RotateCcw } from 'lucide-react';
import PropTypes from 'prop-types';
import { useId, useState } from 'react';

import { LAST_PRICE_COLOR } from '../priceChartUtils';
import { DASH } from './format';
import { InfoTip } from './InfoTip';

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

const TONE_CLASS = {
  good: 'text-bloomberg-green',
  bad: 'text-bloomberg-red',
  neutral: 'text-white',
};

const LOW_QUALITY = /low confidence|not significant/i;

// KPI card: label row (with info tooltip), one value line, optional category,
// comparison, sparkline and sample footnote. Explanations live in the tooltip so every
// card in a grid row has the same height; `gloss` stays in the DOM for screen readers.
export function MetricCard({
  label,
  value,
  category,
  tone = 'neutral',
  gloss,
  formula,
  info,
  sample,
  compare,
  spark,
  status = 'ready',
}) {
  const neutral = value === DASH || status !== 'ready';
  const valueColor = neutral ? TONE_CLASS.neutral : TONE_CLASS[tone] || TONE_CLASS.neutral;
  const tip =
    info ??
    (gloss || formula ? (
      <>
        {gloss && <p>{gloss}</p>}
        {formula && <p className={gloss ? 'mt-1 text-bloomberg-white/80' : ''}>{formula}</p>}
      </>
    ) : null);

  return (
    <div
      aria-busy={status === 'loading' || undefined}
      className="flex h-full min-w-0 flex-col border border-bloomberg-border bg-bloomberg-card p-3 font-mono"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 truncate text-[11px] tracking-wider text-bloomberg-white/80 uppercase">
          {label}
        </div>
        {tip && <InfoTip label={label}>{tip}</InfoTip>}
      </div>

      {status === 'loading' ? (
        <div className="mt-1 h-7">
          <span aria-hidden="true" className="block h-6 w-24 animate-pulse bg-bloomberg-surface" />
          <span className="sr-only">{`Loading ${label}`}</span>
        </div>
      ) : (
        <div
          title={typeof value === 'string' ? value : undefined}
          className={`mt-1 truncate text-xl leading-7 tabular-nums 2xl:text-2xl ${valueColor}`}
        >
          {status === 'unavailable' ? DASH : value}
        </div>
      )}

      {status === 'unavailable' && (
        <span className="mt-1 w-fit border border-bloomberg-amber px-1 text-[9px] tracking-wider text-bloomberg-amber uppercase">
          Unavailable
        </span>
      )}
      {category && status === 'ready' && (
        <div className="truncate text-[11px] text-bloomberg-white/80">{category}</div>
      )}
      {compare && status === 'ready' && (
        <div className="mt-0.5 flex min-w-0 items-baseline gap-1 text-[10px]">
          <span className="truncate text-bloomberg-white/80">{compare.label}</span>
          <span className={`tabular-nums ${TONE_CLASS[compare.tone] || TONE_CLASS.neutral}`}>
            {compare.value}
          </span>
        </div>
      )}
      {spark && status === 'ready' && <Sparkline values={spark} />}
      {gloss && <span className="sr-only">{gloss}</span>}
      {sample && (
        <div
          className={`mt-auto pt-1 text-[10px] ${
            LOW_QUALITY.test(sample) ? 'text-bloomberg-amber' : 'text-bloomberg-white/80'
          }`}
        >
          {sample}
        </div>
      )}
    </div>
  );
}

const toneProp = PropTypes.oneOf(['neutral', 'good', 'bad']);

MetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node.isRequired,
  category: PropTypes.string,
  tone: toneProp,
  gloss: PropTypes.string,
  formula: PropTypes.string,
  info: PropTypes.node,
  sample: PropTypes.string,
  compare: PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired,
    tone: toneProp,
  }),
  spark: PropTypes.arrayOf(PropTypes.number),
  status: PropTypes.oneOf(['ready', 'loading', 'unavailable']),
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

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange';

// Slider for quick exploration plus a number box for exact values (keyboard, precision).
// The box commits on blur/Enter so typing "1" on the way to "150" is not clamped early.
export function SliderField({ label, value, min, max, step = 1, onChange, suffix }) {
  const id = useId();
  const [draft, setDraft] = useState(null);
  const commit = () => {
    const n = Number(draft);
    if (draft !== null && draft !== '' && Number.isFinite(n)) {
      const snapped = Number((Math.round(n / step) * step).toFixed(6));
      onChange(Math.min(max, Math.max(min, snapped)));
    }
    setDraft(null);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1 font-mono text-[11px]">
      <label htmlFor={id} className="truncate tracking-wider text-bloomberg-white/80 uppercase">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          aria-label={`${label} (slider)`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`min-w-0 flex-1 accent-bloomberg-orange ${FOCUS_RING}`}
        />
        <div className="flex w-20 shrink-0 items-center border border-bloomberg-border bg-black focus-within:border-bloomberg-orange">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={draft ?? value}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
            className="h-7 w-full min-w-0 rounded-none bg-transparent px-1.5 text-xs text-white tabular-nums outline-none"
          />
          {suffix && (
            <span
              aria-hidden="true"
              className="shrink-0 pr-1.5 text-[10px] text-bloomberg-white/80"
            >
              {suffix}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

SliderField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  suffix: PropTypes.string,
};

// Labeled number input: unit inside the box, optional source badge, reset and an inline
// error tied to the input with aria-describedby.
export function NumberField({
  label,
  value,
  onChange,
  step = 'any',
  suffix,
  error,
  hint,
  badge,
  onReset,
  min,
  max,
  id,
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const messageId = `${inputId}-message`;
  const message = error || hint;
  return (
    <div className="flex min-w-0 flex-col gap-1 font-mono text-[11px]">
      <div className="flex min-h-4 items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="min-w-0 truncate tracking-wider text-bloomberg-white/80 uppercase"
        >
          {label}
          {suffix && <span className="sr-only">{` (${suffix})`}</span>}
        </label>
        {(badge || onReset) && (
          <span className="flex shrink-0 items-center gap-1">
            {badge && (
              <span className="border border-bloomberg-border px-1 text-[9px] tracking-wider text-bloomberg-white/80 uppercase">
                {badge}
              </span>
            )}
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                aria-label={`Reset ${label}`}
                className={`inline-flex h-4 w-4 items-center justify-center text-bloomberg-white/80 hover:text-bloomberg-orange ${FOCUS_RING}`}
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </div>
      <div
        className={`flex items-center border bg-black focus-within:border-bloomberg-orange ${
          error ? 'border-bloomberg-red' : 'border-bloomberg-border'
        }`}
      >
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={value}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={message ? messageId : undefined}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="h-8 w-full min-w-0 rounded-none bg-transparent px-2 text-xs text-white tabular-nums outline-none"
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="max-w-[45%] shrink-0 truncate pr-2 text-[10px] text-bloomberg-white/80"
          >
            {suffix}
          </span>
        )}
      </div>
      {message && (
        <p
          id={messageId}
          aria-live="polite"
          className={`text-[10px] leading-snug ${error ? 'text-bloomberg-red' : 'text-bloomberg-white/80'}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

NumberField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  onChange: PropTypes.func.isRequired,
  step: PropTypes.string,
  suffix: PropTypes.string,
  error: PropTypes.string,
  hint: PropTypes.string,
  badge: PropTypes.string,
  onReset: PropTypes.func,
  min: PropTypes.number,
  max: PropTypes.number,
  id: PropTypes.string,
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
