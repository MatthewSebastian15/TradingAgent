import PropTypes from 'prop-types';

import { fmtLoss, fmtNum2, fmtPercent, fmtRatio, hurstLabel, ratioTone } from '../format';

export function HeadlineStrip({ vol, shp, dd, var95, regime, hurstVal }) {
  const item = (label, value, tone) => (
    <div className="flex flex-col">
      <span className="text-[10px] tracking-wider text-bloomberg-muted uppercase">{label}</span>
      <span
        className={`text-sm ${
          tone === 'bad'
            ? 'text-bloomberg-red'
            : tone === 'good'
              ? 'text-bloomberg-green'
              : 'text-white'
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
