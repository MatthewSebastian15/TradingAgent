import PropTypes from 'prop-types';

import { fmtLoss, fmtNum2, fmtPercent, fmtRatio, hurstLabel, ratioTone } from '../format';

const TONE_CLASS = {
  good: 'text-bloomberg-green',
  bad: 'text-bloomberg-red',
  neutral: 'text-white',
};

function Item({ label, value, tone = 'neutral' }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[10px] tracking-wider text-bloomberg-white/80 uppercase">{label}</span>
      <span className={`truncate text-sm tabular-nums ${TONE_CLASS[tone] || TONE_CLASS.neutral}`}>
        {value}
      </span>
    </div>
  );
}

Item.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  tone: PropTypes.string,
};

// Key metrics + data warnings. The volatility regime is shown here and nowhere else.
export function HeadlineStrip({
  issues,
  vol,
  shp,
  dd,
  var95,
  regime,
  regimeDays,
  hurstVal,
  hurstSignificant,
}) {
  const regimeValue = Number.isFinite(regimeDays)
    ? `${regime.label} · ${regimeDays}d`
    : regime.label;
  return (
    <section
      aria-label="Quant summary"
      className="border border-bloomberg-border bg-bloomberg-card font-mono"
    >
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-2">
        <Item label="Ann. Vol" value={fmtPercent(vol)} />
        <Item label="Sharpe" value={fmtRatio(shp)} tone={ratioTone(shp)} />
        <Item label="Max DD" value={fmtLoss(dd)} tone="bad" />
        <Item label="VaR 95% (1D)" value={fmtLoss(var95)} tone="bad" />
        <Item label="Vol Regime" value={regimeValue} tone={regime.tone} />
        <Item
          label="Hurst"
          value={`${fmtNum2(hurstVal)} ${hurstLabel(hurstVal, hurstSignificant ?? true)}`}
        />
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
  issues: PropTypes.arrayOf(
    PropTypes.shape({ code: PropTypes.string.isRequired, message: PropTypes.string.isRequired })
  ).isRequired,
  vol: PropTypes.number,
  shp: PropTypes.number,
  dd: PropTypes.number,
  var95: PropTypes.number,
  regime: PropTypes.shape({ label: PropTypes.string, tone: PropTypes.string }).isRequired,
  regimeDays: PropTypes.number,
  hurstVal: PropTypes.number,
  hurstSignificant: PropTypes.bool,
};
