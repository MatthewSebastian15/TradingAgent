import { Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

import { decisionStyle } from '../../hooks/useAnalysisHistoryStore';
import { horizonInfo, returnPct } from '../../utils/portfolioPerf';
import { formatLastPrice } from '../../utils/watchlistFormatters';
import WatchlistTrendBars from '../watchlist/WatchlistTrendBars';

function fmtPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

const HEADERS = [
  'Ticker',
  'Decision',
  'Conf',
  'Entry',
  'Current',
  'Return',
  'Trend',
  'Age/Hzn',
  '',
];

export default function TrackedPositionsTable({ rows, onRemove }) {
  if (!rows.length) {
    return (
      <div className="border border-dashed border-bloomberg-border bg-bloomberg-card px-4 py-10 text-center font-mono text-[11px] tracking-wider text-bloomberg-muted">
        No tracked recommendations yet. Promote a signal from the panel on the right to start
        tracking.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-bloomberg-border bg-bloomberg-card">
      <table className="w-full min-w-[680px] border-collapse font-mono text-[11px]">
        <thead>
          <tr className="border-b border-bloomberg-border bg-bloomberg-surface/60 text-left text-[9px] uppercase tracking-[0.15em] text-bloomberg-muted">
            {HEADERS.map((header, index) => (
              <th
                key={header || `col-${index}`}
                className={`px-3 py-2 font-bold ${index >= 3 && index <= 5 ? 'text-right' : ''}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ position, current, trend }) => {
            const ret = returnPct(position.decision, position.entry_price, current);
            const positive = ret === null ? null : ret >= 0;
            const retClass =
              positive === null
                ? 'text-bloomberg-muted'
                : positive
                  ? 'text-bloomberg-green'
                  : 'text-bloomberg-red';
            const horizon = horizonInfo(position.entry_at, position.time_horizon_months);

            return (
              <tr
                key={position.id}
                className="border-b border-bloomberg-border last:border-b-0 hover:bg-bloomberg-surface/40"
              >
                <td className="px-3 py-2 font-bold text-bloomberg-orange">{position.ticker}</td>
                <td className="px-3 py-2">
                  <span
                    className={`border px-1.5 py-0.5 text-[9px] font-bold uppercase ${decisionStyle(
                      position.decision
                    )}`}
                  >
                    {position.decision || position.display_signal || '-'}
                  </span>
                </td>
                <td className="px-3 py-2 text-bloomberg-muted">
                  {position.confidence_score == null ? '-' : `${position.confidence_score}`}
                </td>
                <td className="px-3 py-2 text-right text-bloomberg-white">
                  {formatLastPrice(position.entry_price)}
                </td>
                <td className="px-3 py-2 text-right text-bloomberg-white">
                  {formatLastPrice(current)}
                </td>
                <td className={`px-3 py-2 text-right font-bold ${retClass}`}>{fmtPct(ret)}</td>
                <td className="px-3 py-2">
                  <WatchlistTrendBars
                    values={trend}
                    positive={positive !== false}
                    width={64}
                    height={20}
                  />
                </td>
                <td className="px-3 py-2 text-bloomberg-muted">
                  {horizon.matured ? (
                    <span className="text-bloomberg-amber">MATURED</span>
                  ) : (
                    horizon.label
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(position.id)}
                    aria-label={`Stop tracking ${position.ticker}`}
                    className="text-bloomberg-muted hover:text-bloomberg-red"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

TrackedPositionsTable.propTypes = {
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      position: PropTypes.object.isRequired,
      current: PropTypes.number,
      trend: PropTypes.arrayOf(PropTypes.number),
    })
  ).isRequired,
  onRemove: PropTypes.func.isRequired,
};
