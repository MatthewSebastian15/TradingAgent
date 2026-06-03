import React from 'react';
import PropTypes from 'prop-types';

import SectionHeader from './SectionHeader';

function formatCell(cell) {
  if (!cell || cell.status === 'unavailable') return 'N/A';
  const value = cell.display ?? cell.value ?? 'N/A';
  return cell.status === 'estimated' ? `${value} EST` : value;
}

function FinancialTable({ periods, rows }) {
  return (
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
  );
}

FinancialTable.propTypes = {
  periods: PropTypes.array.isRequired,
  rows: PropTypes.array.isRequired,
};

export default function FinancialHighlightsTable({ financialHighlights }) {
  const periods = financialHighlights?.periods;
  const sections = financialHighlights?.sections;
  const fallbackRows = financialHighlights?.rows;
  const hasSections = Array.isArray(sections) && sections.some((section) => section.rows?.length);

  if (!Array.isArray(periods) || !periods.length || (!hasSections && !fallbackRows?.length)) {
    return null;
  }

  const pointInTime = Array.isArray(financialHighlights.point_in_time)
    ? financialHighlights.point_in_time
    : [];
  const { title, notes, unit_note: unitNote, data_quality: dataQuality } = financialHighlights;

  return (
    <section className="px-4 py-4 border-b border-bloomberg-border space-y-4">
      <div>
        <SectionHeader label={title || 'KEY FINANCIAL HIGHLIGHTS'} />
        {unitNote && <p className="font-mono text-[11px] text-bloomberg-muted">{unitNote}</p>}
      </div>

      {pointInTime.length > 0 && (
        <div>
          <div className="font-mono text-xs text-bloomberg-orange uppercase tracking-wider mb-2">
            Latest Market Snapshot
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pointInTime.map((item) => (
              <div key={item.key} className="border border-bloomberg-border bg-black px-3 py-2">
                <div className="font-mono text-[10px] text-bloomberg-muted uppercase tracking-wider">
                  {item.label}
                </div>
                <div className="font-mono text-xs text-bloomberg-white mt-1">
                  {item.status === 'unavailable' ? 'N/A' : item.display} {item.unit}
                </div>
                <div className="font-mono text-[10px] text-bloomberg-muted mt-1">
                  As of: {item.as_of || 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSections ? (
        sections.map((section) => (
          <div key={section.key}>
            <div className="font-mono text-xs text-bloomberg-orange uppercase tracking-wider mb-2">
              {section.title}
            </div>
            <FinancialTable periods={periods} rows={section.rows} />
          </div>
        ))
      ) : (
        <FinancialTable periods={periods} rows={fallbackRows} />
      )}

      {dataQuality?.status && (
        <div className="text-[11px] font-mono text-bloomberg-muted">
          Data quality: {dataQuality.status}
        </div>
      )}

      {Array.isArray(notes) && notes.length > 0 && (
        <div className="text-[11px] font-mono text-bloomberg-muted space-y-1">
          {notes.map((note, index) => (
            <p key={index}>{note}</p>
          ))}
        </div>
      )}
    </section>
  );
}

FinancialHighlightsTable.propTypes = {
  financialHighlights: PropTypes.object,
};
