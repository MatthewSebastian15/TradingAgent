import PropTypes from 'prop-types';
import { useRef, useState } from 'react';

import { BENCHMARK_OPTIONS } from '../benchmark';
import { fmtSignedPct, signedTone } from '../format';
import { InfoTip } from '../InfoTip';
import { fmtMoney } from '../numberFormat';

const RF_SOURCE_LABEL = {
  market: 'market default',
  global: 'global default',
  none: 'not configured',
  manual: 'manual',
};

const TONE_CLASS = {
  good: 'text-bloomberg-green',
  bad: 'text-bloomberg-red',
  neutral: 'text-white',
};
const FIELD_LABEL = 'text-[10px] tracking-wider text-bloomberg-white/80 uppercase';

const fmtRfDraft = (pct) => (Number.isFinite(pct) ? String(Number(pct.toFixed(2))) : '');

function Item({ label, value, tone = 'neutral', title }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={FIELD_LABEL}>{label}</span>
      <span className={`truncate text-sm tabular-nums ${TONE_CLASS[tone]}`} title={title}>
        {value}
      </span>
    </div>
  );
}

Item.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['good', 'bad', 'neutral']),
  title: PropTypes.string,
};

// Context row pinned under the navbar (60px) so the window, benchmark and rf behind
// every number stay visible while scrolling a long section.
export function ContextBar({
  symbol,
  ccy,
  last,
  changePct,
  startDate,
  endDate,
  observations,
  benchSymbol,
  onBenchChange,
  rfPct,
  rfSource,
  onRfChange,
  status,
  sticky = false,
}) {
  // The field keeps its own draft so it can be emptied. An empty/non-numeric draft means
  // "back to the market/global default" (onRfChange(null)); out-of-range values are ignored.
  const [draft, setDraft] = useState(() => fmtRfDraft(rfPct));
  const [prev, setPrev] = useState({ symbol, rfPct });
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  if (prev.symbol !== symbol || !Object.is(prev.rfPct, rfPct)) {
    setPrev({ symbol, rfPct });
    if (prev.symbol !== symbol) setEditing(false);
    // Resync on symbol change, or when the parent rate moved away from a non-empty draft
    // while the user is not mid-edit (an empty draft is the user's "use default" state
    // and shows the default as placeholder; the parent echoes typed values at full precision,
    // so resyncing mid-typing would round "4.567" to "4.57").
    if (
      prev.symbol !== symbol ||
      (!editing && draft !== '' && Number(draft) !== Number(fmtRfDraft(rfPct)))
    ) {
      setDraft(fmtRfDraft(rfPct));
    }
  }
  const handleRf = (event) => {
    const raw = event.target.value;
    setDraft(raw);
    setEditing(true);
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value)) onRfChange(null);
    else if (value >= 0 && value <= 100) onRfChange(value / 100);
  };
  const limited = status.label !== 'OK';

  return (
    <div
      role="region"
      aria-label="Analysis context"
      className={`${sticky ? 'sticky top-[60px] z-30 shadow-lg shadow-black/60' : ''} flex flex-wrap items-end gap-x-5 gap-y-2 border border-bloomberg-border bg-bloomberg-card px-4 py-2 font-mono`}
    >
      <Item label="Ticker" value={symbol || '—'} />
      <Item label="Last" value={fmtMoney(last, ccy)} />
      <Item label="Period Δ" value={fmtSignedPct(changePct)} tone={signedTone(changePct)} />
      <Item
        label="Window"
        value={startDate && endDate ? `${startDate} → ${endDate} · ${observations} obs` : '—'}
      />

      <div className="flex flex-col">
        <label htmlFor="quant-bench-select" className={FIELD_LABEL}>
          Benchmark
        </label>
        <select
          id="quant-bench-select"
          value={benchSymbol}
          onChange={(event) => onBenchChange(event.target.value)}
          className="h-7 max-w-[11rem] rounded-none border border-bloomberg-border bg-black px-1 text-sm text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
        >
          {BENCHMARK_OPTIONS.map((b) => (
            <option key={b.symbol} value={b.symbol}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        <label htmlFor="quant-rf-input" className={FIELD_LABEL}>
          Risk-free (annual %)
        </label>
        <span className="flex items-center gap-2">
          <input
            id="quant-rf-input"
            type="number"
            step="0.1"
            min="0"
            max="100"
            aria-label="Risk-free rate, annual percent"
            ref={inputRef}
            value={draft}
            placeholder={fmtRfDraft(rfPct)}
            onChange={handleRf}
            onBlur={() => {
              setEditing(false);
              if (draft !== '') setDraft(fmtRfDraft(rfPct));
            }}
            className="h-7 w-20 rounded-none border border-bloomberg-border bg-black px-1 text-sm text-white tabular-nums focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
          />
          <span className="text-[10px] text-bloomberg-white/80">{RF_SOURCE_LABEL[rfSource]}</span>
          {rfSource === 'manual' && (
            <button
              type="button"
              aria-label="Reset risk-free rate to default"
              onClick={() => {
                // The button unmounts once the rate is back to default; keep focus in the field.
                setEditing(false);
                onRfChange(null);
                inputRef.current?.focus();
              }}
              className="text-[10px] tracking-wider text-bloomberg-orange uppercase hover:text-white"
            >
              reset
            </button>
          )}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1 self-center">
        <span
          className={`border px-1.5 py-0.5 text-[10px] tracking-wider uppercase ${
            limited
              ? 'border-bloomberg-amber text-bloomberg-amber'
              : 'border-bloomberg-border text-bloomberg-white/80'
          }`}
        >
          {limited ? status.label : 'DATA OK'}
        </span>
        {limited && (
          <InfoTip label="data status" side="bottom">
            {`Limited: ${status.reasons.join(', ')}.`}
          </InfoTip>
        )}
      </div>
    </div>
  );
}

ContextBar.propTypes = {
  symbol: PropTypes.string,
  ccy: PropTypes.string,
  last: PropTypes.number,
  changePct: PropTypes.number,
  startDate: PropTypes.string,
  endDate: PropTypes.string,
  observations: PropTypes.number.isRequired,
  benchSymbol: PropTypes.string.isRequired,
  onBenchChange: PropTypes.func.isRequired,
  rfPct: PropTypes.number.isRequired,
  rfSource: PropTypes.oneOf(['market', 'global', 'none', 'manual']).isRequired,
  onRfChange: PropTypes.func.isRequired,
  status: PropTypes.shape({ label: PropTypes.string, reasons: PropTypes.arrayOf(PropTypes.string) })
    .isRequired,
  sticky: PropTypes.bool,
};
