import PropTypes from 'prop-types';

import {
  fmtLoss,
  fmtNum2,
  fmtPercent,
  fmtRatio,
  fmtSignedPct,
  hurstLabel,
  ratioTone,
  signedTone,
} from '../format';
import { fmtMoney } from '../numberFormat';

const RF_SOURCE_LABEL = {
  market: 'market default',
  global: 'global default',
  none: 'not configured',
  manual: 'manual',
};

function valueClass(tone) {
  if (tone === 'bad') return 'text-bloomberg-red';
  if (tone === 'good') return 'text-bloomberg-green';
  return 'text-white';
}

function Item({ label, value, tone }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] tracking-wider text-bloomberg-white/80 uppercase">{label}</span>
      <span className={`truncate text-sm tabular-nums ${valueClass(tone)}`}>{value}</span>
    </div>
  );
}

Item.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  tone: PropTypes.oneOf(['good', 'bad', 'neutral']),
};

export function HeadlineStrip({
  symbol,
  ccy,
  last,
  changePct,
  startDate,
  endDate,
  observations,
  benchLabel,
  rfPct,
  rfSource,
  onRfChange,
  issues,
  vol,
  shp,
  dd,
  var95,
  regime,
  hurstVal,
}) {
  const handleRf = (event) => {
    const raw = event.target.value;
    const value = Number(raw);
    if (raw !== '' && Number.isFinite(value) && value >= 0 && value <= 100) onRfChange(value / 100);
  };
  return (
    <section
      aria-label="Quant summary"
      className="border border-bloomberg-border bg-bloomberg-card font-mono"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 border-b border-bloomberg-border px-4 py-2">
        <Item label="Ticker" value={symbol || '—'} />
        <Item label="Last" value={fmtMoney(last, ccy)} />
        <Item label="Period Δ" value={fmtSignedPct(changePct)} tone={signedTone(changePct)} />
        <Item
          label="Window"
          value={startDate && endDate ? `${startDate} → ${endDate} · ${observations} obs` : '—'}
        />
        <Item label="Benchmark" value={benchLabel} />
        <div className="flex flex-col">
          <label
            htmlFor="quant-rf-input"
            className="text-[10px] tracking-wider text-bloomberg-white/80 uppercase"
          >
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
              value={Number(rfPct.toFixed(2))}
              onChange={handleRf}
              className="w-20 rounded-none border border-bloomberg-border bg-black px-1 py-0.5 text-sm text-white tabular-nums"
            />
            <span className="text-[10px] text-bloomberg-white/80">{RF_SOURCE_LABEL[rfSource]}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-2">
        <Item label="Ann. Vol" value={fmtPercent(vol)} />
        <Item label="Sharpe" value={fmtRatio(shp)} tone={ratioTone(shp)} />
        <Item label="Max DD" value={fmtLoss(dd)} tone="bad" />
        <Item label="VaR 95% (1D)" value={fmtLoss(var95)} tone="bad" />
        <Item label="Vol Regime" value={regime.label} tone={regime.tone} />
        <Item label="Hurst" value={`${fmtNum2(hurstVal)} ${hurstLabel(hurstVal)}`} />
      </div>

      {issues.length > 0 && (
        <ul
          aria-label="Data quality warnings"
          className="space-y-0.5 border-t border-bloomberg-border px-4 py-2 text-[11px] text-bloomberg-amber"
        >
          {issues.map((issue) => (
            <li key={issue.code}>DATA · {issue.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

HeadlineStrip.propTypes = {
  symbol: PropTypes.string,
  ccy: PropTypes.string,
  last: PropTypes.number,
  changePct: PropTypes.number,
  startDate: PropTypes.string,
  endDate: PropTypes.string,
  observations: PropTypes.number.isRequired,
  benchLabel: PropTypes.string.isRequired,
  rfPct: PropTypes.number.isRequired,
  rfSource: PropTypes.oneOf(['market', 'global', 'none', 'manual']).isRequired,
  onRfChange: PropTypes.func.isRequired,
  issues: PropTypes.arrayOf(
    PropTypes.shape({ code: PropTypes.string.isRequired, message: PropTypes.string.isRequired })
  ).isRequired,
  vol: PropTypes.number,
  shp: PropTypes.number,
  dd: PropTypes.number,
  var95: PropTypes.number,
  regime: PropTypes.shape({ label: PropTypes.string, tone: PropTypes.string }).isRequired,
  hurstVal: PropTypes.number,
};
