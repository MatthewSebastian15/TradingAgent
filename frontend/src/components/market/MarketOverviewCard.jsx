import React from 'react';
import PropTypes from 'prop-types';
import MiniSparkline from './MiniSparkline';
import {
  formatMarketChange,
  formatMarketPercent,
  formatMarketPrice,
  marketChangeState,
} from '../../utils/marketFormatters';
import { labelForMarketSymbol } from '../../utils/marketDefaults';

function valueColorClass(state) {
  if (state === 'positive') return 'text-bloomberg-green';
  if (state === 'negative') return 'text-bloomberg-red';
  return 'text-bloomberg-muted';
}

export default function MarketOverviewCard({ item, canDelete, onDelete }) {
  const state = marketChangeState(item.change);
  const positive = state === 'positive' ? true : state === 'negative' ? false : null;
  const label = item.label || labelForMarketSymbol(item.symbol);
  const unavailable = item.status !== 'ok';

  return (
    <div className="min-h-[134px] border border-bloomberg-border bg-black p-3 font-mono">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold uppercase tracking-wider text-bloomberg-orange">
            {label}
          </div>
          <div className="truncate text-[10px] text-bloomberg-muted">{item.symbol}</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? 'Delete instrument' : 'Minimum 3 instruments required'}
          className={`border px-1.5 py-0.5 text-[10px] ${
            canDelete
              ? 'border-bloomberg-border text-bloomberg-muted hover:border-bloomberg-red hover:text-bloomberg-red'
              : 'cursor-not-allowed border-bloomberg-border text-bloomberg-subtle'
          }`}
        >
          X
        </button>
      </div>

      {unavailable ? (
        <div className="flex h-20 items-center text-[11px] text-bloomberg-red">
          {item.reason || 'Market data unavailable'}
        </div>
      ) : (
        <>
          <div className="text-xl font-bold tracking-tight text-bloomberg-white">
            {formatMarketPrice(item.last, item.symbol)}
          </div>
          <div className={`mt-1 text-xs font-bold ${valueColorClass(state)}`}>
            <span>{state === 'positive' ? '^' : state === 'negative' ? 'v' : '-'}</span>{' '}
            {formatMarketPercent(item.change_percent)}{' '}
            <span className="text-bloomberg-muted">.</span> {formatMarketChange(item.change)}
          </div>
          <div className="mt-3">
            <MiniSparkline values={item.sparkline || []} positive={positive} />
          </div>
        </>
      )}
    </div>
  );
}

MarketOverviewCard.propTypes = {
  item: PropTypes.shape({
    symbol: PropTypes.string.isRequired,
    label: PropTypes.string,
    last: PropTypes.number,
    change: PropTypes.number,
    change_percent: PropTypes.number,
    sparkline: PropTypes.arrayOf(PropTypes.number),
    status: PropTypes.string,
    reason: PropTypes.string,
  }).isRequired,
  canDelete: PropTypes.bool.isRequired,
  onDelete: PropTypes.func.isRequired,
};
