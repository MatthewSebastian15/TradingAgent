import React from 'react';
import PropTypes from 'prop-types';

import SectionHeader from './SectionHeader';

function expandYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year)) return null;
  if (year < 100) return year < 50 ? 2000 + year : 1900 + year;
  return year;
}

function displayPeriodLabel(period) {
  const raw = String(period?.display_period || period?.label || period?.period || '').trim();
  let match = raw.match(/^FY\s?(\d{2}|\d{4})$/i);
  if (match) {
    const year = expandYear(match[1]);
    return year ? `FY ${year}` : '-';
  }

  match = raw.match(/^FY\s?(\d{2}|\d{4})Q([1-4])$/i) || raw.match(/^Q([1-4])\s?(\d{2}|\d{4})$/i);
  if (match) {
    const quarter = match[0].toUpperCase().startsWith('FY') ? match[2] : match[1];
    const year = expandYear(match[0].toUpperCase().startsWith('FY') ? match[1] : match[2]);
    return year ? `Q${quarter} ${year}` : '-';
  }

  return raw || '-';
}

function periodSortValue(period) {
  if (period?.sort_key) return String(period.sort_key);
  const label = displayPeriodLabel(period);
  const annual = label.match(/^FY\s(\d{4})$/i);
  if (annual) return `${annual[1]}1231`;
  const quarterLabel = label.match(/^Q([1-4])\s(\d{4})$/i);
  if (quarterLabel)
    return `${quarterLabel[2]}${String(Number(quarterLabel[1]) * 3).padStart(2, '0')}31`;
  const year = Number(period?.year || period?.fiscal_year || 0);
  const quarter = Number(period?.quarter || period?.fiscal_quarter || 0);
  return `${String(year).padStart(4, '0')}${String(quarter).padStart(2, '0')}`;
}

function sortPeriodsForDisplay(periods) {
  return [...periods].sort((left, right) =>
    periodSortValue(right).localeCompare(periodSortValue(left))
  );
}

function unitSuffix(unit) {
  const text = String(unit || '');
  if (/\bBn\b/i.test(text)) return 'Bn';
  if (/\bMn\b/i.test(text)) return 'Mn';
  if (text.includes('%')) return '%';
  if (/\/share/i.test(text)) return text;
  if (/\bx\b/i.test(text) || /ratio/i.test(text)) return 'x';
  return '';
}

function isUnavailableDisplay(value) {
  if (value === null || value === undefined || value === '') return true;
  const text = String(value).trim().toLowerCase();
  return ['n/a', 'na', 'source unavailable', 'none', 'null', '-'].includes(text);
}

function appendUnit(value, unit) {
  if (isUnavailableDisplay(value)) return 'N/A';
  const suffix = unitSuffix(unit);
  if (!suffix) return value;
  const trimmed = String(value).trim();
  if (suffix === '%') return `${trimmed.replace(/\s*%$/, '')} %`;
  if (suffix === 'x') return /\s*x$/i.test(trimmed) ? trimmed : `${trimmed}x`;
  if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) return trimmed;
  return `${trimmed} ${suffix}`;
}

function formatCellValue(cell, unit) {
  if (!cell || cell.status === 'unavailable') return 'N/A';
  const value = cell.display ?? cell.value;
  if (isUnavailableDisplay(value)) {
    return 'N/A';
  }
  const text = cell.status === 'estimated' ? `${value} EST` : String(value);
  return appendUnit(text, unit);
}

function cellHasValue(cell) {
  if (!cell || cell.status === 'unavailable') return false;
  return !isUnavailableDisplay(cell.display ?? cell.value);
}

function numericCellValue(cell) {
  if (!cell || cell.status === 'unavailable') return null;
  const rawNumber = Number(cell.value);
  if (Number.isFinite(rawNumber)) return rawNumber;
  const match = String(cell.display || '')
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const displayNumber = Number(match[0]);
  return Number.isFinite(displayNumber) ? displayNumber : null;
}

function latestAvailableCell(row, displayPeriods) {
  for (const period of displayPeriods) {
    const cell = row.values?.[period.key];
    if (cellHasValue(cell)) return { period, cell };
  }
  return { period: displayPeriods[0], cell: row.values?.[displayPeriods[0]?.key] };
}

function formatGrowthValue(value) {
  if (!Number.isFinite(value)) return '-';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} %`;
}

function rowGrowthDisplay(row, latestPeriod, displayPeriods) {
  const latestIndex = displayPeriods.findIndex((period) => period.key === latestPeriod?.key);
  if (latestIndex < 0) return '-';

  const latestValue = numericCellValue(row.values?.[latestPeriod.key]);
  const previousPeriod = displayPeriods.slice(latestIndex + 1).find((period) =>
    Number.isFinite(numericCellValue(row.values?.[period.key]))
  );
  const previousValue = numericCellValue(row.values?.[previousPeriod?.key]);

  if (!Number.isFinite(latestValue) || !Number.isFinite(previousValue) || previousValue === 0) {
    return '-';
  }

  return formatGrowthValue(((latestValue - previousValue) / Math.abs(previousValue)) * 100);
}

function statusDisplay(cell) {
  if (!cell || cell.status === 'unavailable') return '-';
  const status = String(cell.status || '').trim();
  return status ? status.toUpperCase() : '-';
}

function FinancialMetricGroupTable({ periods, rows }) {
  const displayPeriods = sortPeriodsForDisplay(periods);

  return (
    <div className="overflow-x-auto border border-bloomberg-border">
      <table className="min-w-[520px] w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="border-b border-bloomberg-border text-bloomberg-muted">
            <th className="min-w-[190px] px-3 py-2 text-left whitespace-nowrap">Metric</th>
            <th className="min-w-[110px] px-3 py-2 text-right whitespace-nowrap">Value</th>
            <th className="min-w-[110px] px-3 py-2 text-right whitespace-nowrap">YoY / Growth</th>
            <th className="min-w-[88px] px-3 py-2 text-left whitespace-nowrap">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const latest = latestAvailableCell(row, displayPeriods);
            return (
              <tr key={row.key} className="border-b border-bloomberg-border border-opacity-50">
                <td className="min-w-[190px] px-3 py-2 text-bloomberg-white whitespace-nowrap">
                  {row.label}
                </td>
                <td className="min-w-[110px] px-3 py-2 text-right text-bloomberg-white whitespace-nowrap">
                  {formatCellValue(latest.cell, row.unit)}
                </td>
                <td className="min-w-[110px] px-3 py-2 text-right text-bloomberg-white whitespace-nowrap">
                  {rowGrowthDisplay(row, latest.period, displayPeriods)}
                </td>
                <td className="min-w-[88px] px-3 py-2 text-bloomberg-muted whitespace-nowrap">
                  {statusDisplay(latest.cell)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

FinancialMetricGroupTable.propTypes = {
  periods: PropTypes.array.isRequired,
  rows: PropTypes.array.isRequired,
};

function FinancialTable({ periods, rows }) {
  const displayPeriods = sortPeriodsForDisplay(periods);
  return (
    <div className="overflow-x-auto border border-bloomberg-border">
      <table className="min-w-[980px] w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="text-bloomberg-muted border-b border-bloomberg-border">
            <th className="sticky left-0 z-20 bg-black text-left px-3 py-2 whitespace-nowrap min-w-[190px]">
              Metric
            </th>
            {displayPeriods.map((period) => (
              <th key={period.key} className="text-right px-3 py-2 whitespace-nowrap min-w-[86px]">
                {displayPeriodLabel(period)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-bloomberg-border border-opacity-50">
              <td className="sticky left-0 z-10 bg-black px-3 py-2 text-bloomberg-white whitespace-nowrap min-w-[190px]">
                <div>{row.label}</div>
              </td>
              {displayPeriods.map((period) => (
                <td
                  key={period.key}
                  className="px-3 py-2 text-right text-bloomberg-white whitespace-nowrap min-w-[86px]"
                >
                  <div>{formatCellValue(row.values?.[period.key], row.unit)}</div>
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
  const hasGroupedSections = Array.isArray(sections) &&
    sections.some((section) => section.groups?.some((group) => group.rows?.length));

  if (
    !Array.isArray(periods) ||
    !periods.length ||
    (!hasGroupedSections && !hasSections && !fallbackRows?.length)
  ) {
    return null;
  }

  const pointInTime = Array.isArray(financialHighlights.point_in_time)
    ? financialHighlights.point_in_time
    : [];
  const { title, unit_note: unitNote } = financialHighlights;

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
                  {formatCellValue(item, item.unit)}
                </div>
                <div className="font-mono text-[10px] text-bloomberg-muted mt-1">
                  As of: {item.as_of || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasGroupedSections ? (
        sections.map((section) => (
          <div key={section.key} className="space-y-3">
            <div className="font-mono text-xs text-bloomberg-orange uppercase tracking-wider">
              {section.title}
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {section.groups.map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className="font-mono text-[11px] text-bloomberg-muted uppercase tracking-wider">
                    {group.title}
                  </div>
                  <FinancialMetricGroupTable periods={periods} rows={group.rows} />
                </div>
              ))}
            </div>
          </div>
        ))
      ) : hasSections ? (
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
    </section>
  );
}

FinancialHighlightsTable.propTypes = {
  financialHighlights: PropTypes.object,
};
