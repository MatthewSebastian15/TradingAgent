import PropTypes from 'prop-types';
import { useCallback, useState } from 'react';

import { SectionCard, SkeletonRow } from './primitives';
import { getFinancials } from '../../api/market';
import { useResearchData } from '../../hooks/useResearchData';

const STATEMENTS = ['income', 'balance'];

export default function FinancialsTab({ ticker }) {
  const [statement, setStatement] = useState('income');
  const load = useCallback(
    ({ signal }) => getFinancials(ticker, statement, { signal }),
    [ticker, statement]
  );
  const { data, loading, error } = useResearchData(load);
  const rows = data?.rows || [];
  // A period no row has a value for (e.g. a not-yet-reported quarter) is just an empty column.
  const periods = (data?.periods || []).filter((p) =>
    rows.some((row) => (row.values?.[p.key] ?? '-') !== '-')
  );

  return (
    <SectionCard title="FINANCIALS">
      <div className="flex gap-2 px-3 py-2 border-b border-bloomberg-border">
        {STATEMENTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatement(s)}
            aria-pressed={statement === s}
            className={`font-mono text-[10px] px-2 py-0.5 uppercase ${
              statement === s
                ? 'text-bloomberg-orange border border-bloomberg-orange'
                : 'text-bloomberg-muted border border-transparent hover:text-bloomberg-white'
            }`}
          >
            {s.toUpperCase()}
          </button>
        ))}
      </div>
      {loading && (
        <div data-testid="financials-loading">
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
      {!loading && !error && rows.length === 0 && (
        <div className="px-4 py-6 font-mono text-xs text-bloomberg-muted">
          ■ NO FINANCIAL DATA AVAILABLE FOR THIS TICKER
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="terminal-table w-full">
            <thead>
              <tr>
                <th className="px-3 py-1.5 text-left" scope="col">
                  <span className="sr-only">Metric</span>
                </th>
                {periods.map((p) => (
                  <th key={p.key} className="px-3 py-1.5 text-right" scope="col">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="px-3 py-1.5 font-mono text-[10px] text-bloomberg-muted text-left font-normal"
                  >
                    {row.label}
                  </th>
                  {periods.map((p) => (
                    <td
                      key={p.key}
                      className="px-3 py-1.5 font-mono text-xs text-bloomberg-white text-right tabular-nums"
                    >
                      {row.values?.[p.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data?.unit_note && (
            <p className="px-3 py-2 font-mono text-[10px] text-bloomberg-muted">{data.unit_note}</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

FinancialsTab.propTypes = { ticker: PropTypes.string.isRequired };
