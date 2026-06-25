import { Plus, Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useState } from 'react';

import { positionStats } from '../../utils/holdingsPerf';
import { formatChangePercent } from '../../utils/watchlistFormatters';
import WatchlistTrendBars from '../watchlist/WatchlistTrendBars';

function money(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

function signClass(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'text-bloomberg-muted';
  return value >= 0 ? 'text-bloomberg-green' : 'text-bloomberg-red';
}

const HEADERS = [
  'Ticker',
  'Shares',
  'Avg Cost',
  'Price',
  'Day %',
  'Mkt Value',
  'Total P/L',
  'Weight',
  'Trend',
  '',
];

const inputClass =
  'w-full border border-bloomberg-border bg-black px-2 py-1.5 font-mono text-[11px] text-bloomberg-white placeholder:text-bloomberg-muted focus:border-bloomberg-orange focus:outline-none';

function AddHoldingForm({ onAdd, busy }) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [cost, setCost] = useState('');

  const submit = (event) => {
    event.preventDefault();
    const record = { ticker, shares: Number(shares), cost_basis: Number(cost) };
    onAdd(record).then((ok) => {
      if (ok) {
        setTicker('');
        setShares('');
        setCost('');
      }
    });
  };

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-2 gap-2 border-b border-bloomberg-border bg-bloomberg-surface/40 p-3 sm:grid-cols-4"
    >
      <input
        className={inputClass}
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="Ticker (AAPL)"
        aria-label="Ticker"
        autoComplete="off"
      />
      <input
        className={inputClass}
        value={shares}
        onChange={(e) => setShares(e.target.value)}
        placeholder="Shares"
        inputMode="decimal"
        aria-label="Shares"
      />
      <input
        className={inputClass}
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        placeholder="Avg cost / share"
        inputMode="decimal"
        aria-label="Average cost per share"
      />
      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-1 border border-bloomberg-orange bg-bloomberg-orange/10 px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-bloomberg-orange hover:bg-bloomberg-orange/20 disabled:opacity-50"
      >
        <Plus size={13} />
        Add
      </button>
    </form>
  );
}
AddHoldingForm.propTypes = {
  onAdd: PropTypes.func.isRequired,
  busy: PropTypes.bool,
};

export default function HoldingsTable({ rows, totalValue, onAdd, onRemove, error, busy }) {
  return (
    <div className="border border-bloomberg-border bg-bloomberg-card">
      <AddHoldingForm onAdd={onAdd} busy={busy} />

      {error && (
        <div role="alert" className="border-b border-bloomberg-border px-3 py-2 font-mono text-[10px] text-bloomberg-red">
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center font-mono text-[11px] tracking-wider text-bloomberg-muted">
          No holdings yet. Add a position above to track its live value and P/L.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse font-mono text-[11px]">
            <thead>
              <tr className="border-b border-bloomberg-border bg-bloomberg-surface/60 text-left text-[9px] uppercase tracking-[0.15em] text-bloomberg-muted">
                {HEADERS.map((header, index) => (
                  <th
                    key={header || `col-${index}`}
                    className={`px-3 py-2 font-bold ${index >= 1 && index <= 7 ? 'text-right' : ''}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ holding, price, chg, trend }) => {
                const s = positionStats(holding, price, chg);
                const weight =
                  s.value !== null && Number.isFinite(totalValue) && totalValue > 0
                    ? s.value / totalValue
                    : null;
                return (
                  <tr
                    key={holding.id}
                    className="border-b border-bloomberg-border last:border-b-0 hover:bg-bloomberg-surface/40"
                  >
                    <td className="px-3 py-2 font-bold text-bloomberg-orange">{holding.ticker}</td>
                    <td className="px-3 py-2 text-right text-bloomberg-white">{holding.shares}</td>
                    <td className="px-3 py-2 text-right text-bloomberg-muted">
                      {money(holding.cost_basis)}
                    </td>
                    <td className="px-3 py-2 text-right text-bloomberg-white">{money(price)}</td>
                    <td className={`px-3 py-2 text-right ${signClass(s.dayPL)}`}>
                      {formatChangePercent(chg)}
                    </td>
                    <td className="px-3 py-2 text-right text-bloomberg-white">{money(s.value)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${signClass(s.pl)}`}>
                      {s.pl === null ? '-' : `${money(s.pl)} / ${pct(s.plPct)}`}
                    </td>
                    <td className="px-3 py-2 text-right text-bloomberg-muted">
                      {weight === null ? '-' : `${(weight * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-3 py-2">
                      <WatchlistTrendBars
                        values={trend || []}
                        positive={s.pl === null ? true : s.pl >= 0}
                        width={64}
                        height={20}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(holding.id)}
                        aria-label={`Remove ${holding.ticker}`}
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
      )}
    </div>
  );
}

HoldingsTable.propTypes = {
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      holding: PropTypes.object.isRequired,
      price: PropTypes.number,
      chg: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      trend: PropTypes.arrayOf(PropTypes.number),
    })
  ).isRequired,
  totalValue: PropTypes.number,
  onAdd: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  error: PropTypes.string,
  busy: PropTypes.bool,
};
