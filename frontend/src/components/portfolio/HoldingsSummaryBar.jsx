import PropTypes from 'prop-types';
import React from 'react';

function money(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return ` (${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%)`;
}

function signClass(value) {
  if (!Number.isFinite(value)) return 'text-bloomberg-white';
  return value >= 0 ? 'text-bloomberg-green' : 'text-bloomberg-red';
}

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

export default function HoldingsSummaryBar({ summary }) {
  const { count, totalValue, totalCost, totalPL, totalPLPct, totalDayPL } = summary;

  return (
    <div className="grid grid-cols-2 border border-bloomberg-border bg-bloomberg-card sm:grid-cols-3 lg:grid-cols-5">
      <Cell label="Positions" value={count} valueClass="text-bloomberg-orange" />
      <Cell label="Market Value" value={money(totalValue)} />
      <Cell label="Cost Basis" value={money(totalCost)} valueClass="text-bloomberg-muted" />
      <Cell
        label="Total P/L"
        value={totalPL === null ? '-' : `${money(totalPL)}${pct(totalPLPct)}`}
        valueClass={signClass(totalPL)}
      />
      <Cell
        label="Day P/L"
        value={money(totalDayPL)}
        valueClass={signClass(totalDayPL)}
      />
    </div>
  );
}

HoldingsSummaryBar.propTypes = {
  summary: PropTypes.shape({
    count: PropTypes.number,
    totalValue: PropTypes.number,
    totalCost: PropTypes.number,
    totalPL: PropTypes.number,
    totalPLPct: PropTypes.number,
    totalDayPL: PropTypes.number,
  }).isRequired,
};
