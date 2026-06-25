import PropTypes from 'prop-types';
import React from 'react';

import { pct, signClass } from '../../utils/formatting';

function Cell({ label, value, valueClass = 'text-bloomberg-white' }) {
  return (
    <div className="flex flex-col gap-1 border-r border-bloomberg-border px-4 py-2 last:border-r-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-bloomberg-muted">
        {label}
      </span>
      <span className={`font-mono text-sm font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}
Cell.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  valueClass: PropTypes.string,
};

export default function PortfolioSummaryBar({ summary }) {
  const { trackedCount, winRate, avgReturn, best, worst } = summary;

  return (
    <div className="grid grid-cols-2 border border-bloomberg-border bg-bloomberg-card sm:grid-cols-3 lg:grid-cols-5">
      <Cell label="Tracked" value={trackedCount} valueClass="text-bloomberg-orange" />
      <Cell label="Win Rate" value={winRate === null ? '-' : `${Math.round(winRate * 100)}%`} />
      <Cell label="Avg Return" value={pct(avgReturn)} valueClass={signClass(avgReturn)} />
      <Cell
        label="Best"
        value={best ? `${best.ticker} ${pct(best.return)}` : '-'}
        valueClass={best ? signClass(best.return) : undefined}
      />
      <Cell
        label="Worst"
        value={worst ? `${worst.ticker} ${pct(worst.return)}` : '-'}
        valueClass={worst ? signClass(worst.return) : undefined}
      />
    </div>
  );
}

PortfolioSummaryBar.propTypes = {
  summary: PropTypes.shape({
    trackedCount: PropTypes.number,
    winRate: PropTypes.number,
    avgReturn: PropTypes.number,
    best: PropTypes.object,
    worst: PropTypes.object,
  }).isRequired,
};
