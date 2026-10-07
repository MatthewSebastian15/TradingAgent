import PropTypes from 'prop-types';
import { useCallback } from 'react';

import { DataRow, SectionCard, SkeletonRow } from './primitives';
import { getTechnicals } from '../../api/market';
import { useResearchTabData } from '../../hooks/useResearchTabData';

const show = (value) => (value === null || value === undefined || value === '' ? 'N/A' : value);

const ROWS = [
  ['ENTRY QUALITY', 'entry_quality'],
  ['TREND', 'trend'],
  ['RSI 14', 'rsi'],
  ['RSI SIGNAL', 'rsi_signal'],
  ['MACD', 'macd'],
  ['MACD SIGNAL', 'macd_signal'],
  ['ATR', 'atr'],
  ['SMA 20', 'sma_20'],
  ['SMA 50', 'sma_50'],
  ['SMA 200', 'sma_200'],
  ['SUPPORT', 'support'],
  ['RESISTANCE', 'resistance'],
  ['VOLUME TREND', 'volume_trend'],
];

export default function TechnicalsTab({ ticker }) {
  const load = useCallback(({ signal }) => getTechnicals(ticker, { signal }), [ticker]);
  const { data, loading, error } = useResearchTabData(load);
  const reasons = Array.isArray(data?.reasons) ? data.reasons : [];

  return (
    <SectionCard title="TECHNICALS">
      {loading && (
        <div data-testid="technicals-loading">
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}
      {error && (
        <div className="px-4 py-6 font-mono text-xs text-bloomberg-red">
          ■ FAILED TO LOAD: {error}
        </div>
      )}
      {data && !data.available && (
        <div className="px-4 py-6 font-mono text-xs text-bloomberg-muted space-y-1">
          <div>■ NO TECHNICAL DATA AVAILABLE FOR THIS TICKER</div>
          {reasons.map((reason) => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      )}
      {data?.available && (
        <>
          {ROWS.map(([label, key]) => (
            <DataRow key={key} label={label} value={show(data[key])} />
          ))}
          {reasons.length > 0 && (
            <ul className="px-3 py-2 space-y-1 font-mono text-[10px] text-bloomberg-muted">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </SectionCard>
  );
}

TechnicalsTab.propTypes = { ticker: PropTypes.string.isRequired };
