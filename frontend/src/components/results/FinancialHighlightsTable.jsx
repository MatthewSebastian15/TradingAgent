import React from 'react';
import PropTypes from 'prop-types';

import DataStatusBadge from '../DataStatusBadge';
import SectionHeader from './SectionHeader';
import { getDataStatusLabel, getDisplayValue, getFieldQuality } from '../../utils/dataStatus';

function formatCell(cell) {
  if (!cell) return { text: 'N/A', reason: null };
  const status = cell.status === 'unavailable' ? 'source_unavailable' : cell.status;
  const quality = { status, reason: cell.reason || cell.warning || null };
  const display = getDisplayValue(cell.display ?? cell.value, quality);
  const text = cell.status === 'estimated' && display.text !== 'N/A'
    ? `${display.text} EST`
    : display.text;
  return { text, reason: display.reason };
}

function qualityForKey(dataQuality, key) {
  const aliases = {
    revenue_growth: 'revenue_growth_percent',
    net_profit_growth: 'net_profit_growth_percent',
    ebitda_margin: 'ebitda_margin',
    net_profit_margin: 'net_profit_margin',
  };
  return getFieldQuality(dataQuality, key) || getFieldQuality(dataQuality, aliases[key]);
}

function FinancialTable({ periods, rows, dataQuality }) {
  return (
    <div className="overflow-x-auto border border-bloomberg-border">
      <table className="min-w-[980px] w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="text-bloomberg-muted border-b border-bloomberg-border">
            <th className="sticky left-0 z-20 bg-black text-left px-3 py-2 whitespace-nowrap min-w-[190px]">
              Metric
            </th>
            <th className="sticky left-[190px] z-20 bg-black text-left px-3 py-2 whitespace-nowrap min-w-[90px] border-r border-bloomberg-border">
              Unit
            </th>
            {periods.map((period) => (
              <th key={period.key} className="text-right px-3 py-2 whitespace-nowrap min-w-[86px]">
                {period.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-bloomberg-border border-opacity-50">
              <td className="sticky left-0 z-10 bg-black px-3 py-2 text-bloomberg-white whitespace-nowrap min-w-[190px]">
                <div>{row.label}</div>
                {qualityForKey(dataQuality, row.key) && (
                  <div className="mt-1">
                    <DataStatusBadge compact quality={qualityForKey(dataQuality, row.key)} />
                  </div>
                )}
              </td>
              <td className="sticky left-[190px] z-10 bg-black px-3 py-2 text-bloomberg-muted whitespace-nowrap min-w-[90px] border-r border-bloomberg-border">
                {row.unit || '-'}
              </td>
              {periods.map((period) => (
                <td
                  key={period.key}
                  className="px-3 py-2 text-right text-bloomberg-white whitespace-nowrap min-w-[86px]"
                >
                  {(() => {
                    const display = formatCell(row.values?.[period.key]);
                    return (
                      <>
                        <div>{display.text}</div>
                        {display.reason && (
                          <div className="mt-1 text-[10px] text-bloomberg-muted">Reason: {display.reason}</div>
                        )}
                      </>
                    );
                  })()}
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
  dataQuality: PropTypes.object,
};

export default function FinancialHighlightsTable({ financialHighlights, dataQuality: fieldQuality }) {
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
  const { title, notes, unit_note: unitNote, data_quality: sectionDataQuality } = financialHighlights;

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
                  {item.status === 'unavailable' ? getDataStatusLabel('source_unavailable') : item.display} {item.unit}
                </div>
                <div className="font-mono text-[10px] text-bloomberg-muted mt-1">
                  As of: {item.as_of || 'N/A'}
                </div>
                {qualityForKey(fieldQuality, item.key) && (
                  <div className="mt-2">
                    <DataStatusBadge compact quality={qualityForKey(fieldQuality, item.key)} />
                  </div>
                )}
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
            <FinancialTable periods={periods} rows={section.rows} dataQuality={fieldQuality} />
          </div>
        ))
      ) : (
        <FinancialTable periods={periods} rows={fallbackRows} dataQuality={fieldQuality} />
      )}

      {sectionDataQuality?.status && (
        <div className="text-[11px] font-mono text-bloomberg-muted">
          Data quality: {sectionDataQuality.status}
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
  dataQuality: PropTypes.object,
};
