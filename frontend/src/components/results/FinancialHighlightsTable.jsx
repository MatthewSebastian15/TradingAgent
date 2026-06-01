import React from 'react';
import PropTypes from 'prop-types';

import SectionHeader from './SectionHeader';

function formatCell(cell) {
  if (!cell || cell.status === 'unavailable') return 'N/A';
  const value = cell.display ?? cell.value ?? 'N/A';
  return cell.status === 'estimated' ? `${value} EST` : value;
}

export default function FinancialHighlightsTable({ financialHighlights }) {
  if (!financialHighlights?.periods?.length || !financialHighlights?.rows?.length) {
    return null;
  }

  const { title, periods, rows, notes, data_quality: dataQuality } = financialHighlights;

  return (
    <section className="px-4 py-4 border-b border-bloomberg-border">
      <SectionHeader label={title || 'KEY FINANCIAL HIGHLIGHTS'} />
      <div className="overflow-x-auto border border-bloomberg-border">
        <table className="min-w-full text-xs font-mono">
          <thead>
            <tr className="text-bloomberg-muted border-b border-bloomberg-border">
              <th className="text-left px-3 py-2 whitespace-nowrap">Metric</th>
              {periods.map((period) => (
                <th key={period.key} className="text-right px-3 py-2 whitespace-nowrap">
                  {period.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-bloomberg-border border-opacity-50">
                <td className="px-3 py-2 text-bloomberg-white whitespace-nowrap">{row.label}</td>
                {periods.map((period) => (
                  <td
                    key={period.key}
                    className="px-3 py-2 text-right text-bloomberg-white whitespace-nowrap"
                  >
                    {formatCell(row.values?.[period.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dataQuality?.status && (
        <div className="mt-2 text-[11px] font-mono text-bloomberg-muted">
          Data quality: {dataQuality.status}
        </div>
      )}

      {Array.isArray(notes) && notes.length > 0 && (
        <div className="mt-2 text-[11px] font-mono text-bloomberg-muted space-y-1">
          {notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      )}
    </section>
  );
}

FinancialHighlightsTable.propTypes = {
  financialHighlights: PropTypes.shape({
    title: PropTypes.string,
    periods: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
      })
    ),
    rows: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired,
        values: PropTypes.object,
      })
    ),
    notes: PropTypes.arrayOf(PropTypes.string),
    data_quality: PropTypes.object,
  }),
};
