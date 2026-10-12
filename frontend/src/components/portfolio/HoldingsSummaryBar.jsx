import PropTypes from 'prop-types';
import React from 'react';

import { formatMoney } from '../../utils/currency';
import { pct as fmtPct, signClass } from '../../utils/formatting';

const pct = (value) => fmtPct(value, { parens: true, invalid: '' });

const EMPTY = {
  currency: 'USD',
  count: 0,
  totalValue: null,
  totalCost: null,
  totalPL: null,
  totalPLPct: null,
  totalDayPL: null,
};

function Cell({ label, value, valueClass = 'text-bloomberg-white', note = '' }) {
  return (
    <div className="flex flex-col gap-1 border-r border-bloomberg-border px-4 py-2 last:border-r-0">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-bloomberg-muted">
        {label}
      </span>
      <span className={`font-mono text-sm font-bold ${valueClass}`}>{value}</span>
      {note && <span className="font-mono text-[10px] text-bloomberg-amber">{note}</span>}
    </div>
  );
}
Cell.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  valueClass: PropTypes.string,
  note: PropTypes.string,
};

function SummaryRow({ summary }) {
  const { currency, count, tickerCount, unpricedCount = 0 } = summary;
  const { totalValue, totalCost, totalPL, totalPLPct, totalDayPL } = summary;
  const money = (value) => formatMoney(value, currency);

  return (
    <div className="grid grid-cols-2 border border-bloomberg-border bg-bloomberg-card sm:grid-cols-3 lg:grid-cols-5">
      <Cell
        label={`Positions · ${currency}`}
        value={tickerCount ?? count}
        valueClass="text-bloomberg-orange"
        note={unpricedCount > 0 ? `${unpricedCount} unpriced` : ''}
      />
      <Cell label="Market Value" value={money(totalValue)} />
      <Cell label="Cost Basis" value={money(totalCost)} valueClass="text-bloomberg-white/60" />
      <Cell
        label="Total P/L"
        value={totalPL === null ? '-' : `${money(totalPL)}${pct(totalPLPct)}`}
        valueClass={signClass(totalPL)}
      />
      <Cell label="Day P/L" value={money(totalDayPL)} valueClass={signClass(totalDayPL)} />
    </div>
  );
}
SummaryRow.propTypes = { summary: PropTypes.object.isRequired };

export default function HoldingsSummaryBar({ summaries }) {
  const list = summaries.length ? summaries : [EMPTY];
  return (
    <div className="space-y-2">
      {list.map((summary) => (
        <SummaryRow key={summary.currency} summary={summary} />
      ))}
    </div>
  );
}

HoldingsSummaryBar.propTypes = {
  summaries: PropTypes.arrayOf(
    PropTypes.shape({
      currency: PropTypes.string.isRequired,
      count: PropTypes.number,
      tickerCount: PropTypes.number,
      unpricedCount: PropTypes.number,
      totalValue: PropTypes.number,
      totalCost: PropTypes.number,
      totalPL: PropTypes.number,
      totalPLPct: PropTypes.number,
      totalDayPL: PropTypes.number,
    })
  ).isRequired,
};
