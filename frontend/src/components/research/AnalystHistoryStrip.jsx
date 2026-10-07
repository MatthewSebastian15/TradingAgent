import PropTypes from 'prop-types';
import { useCallback } from 'react';

import { SkeletonRow } from './primitives';
import { getAnalystHistory } from '../../api/market';
import { useResearchData } from '../../hooks/useResearchData';

const SEGMENTS = [
  ['strong_buy', 'Strong Buy', 'bg-bloomberg-green'],
  ['buy', 'Buy', 'bg-bloomberg-green/60'],
  ['hold', 'Hold', 'bg-bloomberg-amber'],
  ['sell', 'Sell', 'bg-bloomberg-red/60'],
  ['strong_sell', 'Strong Sell', 'bg-bloomberg-red'],
];

// "0m" is the current month; older periods read "-1m", "-2m", ...
const periodLabel = (period) => (period === '0m' ? 'NOW' : String(period).toUpperCase());

// Non-blocking add-on for the analyst card: renders nothing without a ticker, without
// coverage, or when the request fails.
export default function AnalystHistoryStrip({ ticker }) {
  const load = useCallback(
    ({ signal }) => (ticker ? getAnalystHistory(ticker, { signal }) : Promise.resolve(null)),
    [ticker]
  );
  const { data, loading } = useResearchData(load);
  const history = data?.history || [];

  if (!ticker) return null;
  if (loading) return <SkeletonRow />;
  if (history.length === 0) return null;

  return (
    <div data-testid="analyst-history-strip" className="px-3 py-3 border-t border-bloomberg-border">
      <div className="font-mono text-[9px] text-bloomberg-muted mb-2">RATING HISTORY</div>
      <div className="space-y-1.5">
        {history.map((row) => {
          const total = SEGMENTS.reduce((sum, [key]) => sum + (Number(row[key]) || 0), 0);
          return (
            <div
              key={row.period}
              data-testid="analyst-history-row"
              className="flex items-center gap-2"
            >
              <span className="w-8 shrink-0 font-mono text-[9px] text-bloomberg-muted">
                {periodLabel(row.period)}
              </span>
              <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-bloomberg-border">
                {SEGMENTS.map(([key, label, color]) => {
                  const count = Number(row[key]) || 0;
                  if (!count || !total) return null;
                  return (
                    <div
                      key={key}
                      className={color}
                      style={{ width: `${(count / total) * 100}%` }}
                      title={`${label} ${count}`}
                    />
                  );
                })}
              </div>
              <span className="w-6 shrink-0 text-right font-mono text-[9px] text-bloomberg-muted">
                {total}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 font-mono text-[9px] text-bloomberg-muted">
        {SEGMENTS.map(([key, label, color]) => (
          <span key={key}>
            <span className={`${color.replace('bg-', 'text-')}`}>■</span> {label.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

AnalystHistoryStrip.propTypes = { ticker: PropTypes.string };
