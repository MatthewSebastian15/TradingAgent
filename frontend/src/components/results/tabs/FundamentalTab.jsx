import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Activity, BarChart3, Landmark, Percent, Table2, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import FinancialHighlightsTable from '../FinancialHighlightsTable';
import SectionHeader from '../SectionHeader';

const UNAVAILABLE_CELL = { value: null, display: '-', status: 'unavailable' };
const CHART_WIDTH = 1040;
const CHART_LEFT = 218;
const CHART_RIGHT = 36;
const CHART_TOP = 42;
const CHART_BOTTOM = 50;
const CHART_ROW_HEIGHT = 54;
const CHART_BAR_TOP_OFFSET = 12;
const CHART_BAR_HEIGHT = 28;
const CHART_GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const CHART_AXIS_COLOR = 'rgba(255, 255, 255, 0.18)';
const CHART_BAR_COLOR = '#f97316';
const CHART_NEGATIVE_COLOR = '#ef4444';
const CHART_ZERO_COLOR = '#525252';

const FUNDAMENTAL_GROUPS = [
  {
    id: 'income',
    label: 'Income',
    Icon: TrendingUp,
    metrics: [
      'Revenue',
      'EBITDA',
      'Net Profit',
      'Revenue Growth (%)',
      'Net Profit Growth (%)',
      'EBITDA Margin (%)',
      'Net Profit Margin (%)',
      'EPS',
    ],
  },
  {
    id: 'balance_sheet',
    label: 'Balance Sheet',
    Icon: Landmark,
    metrics: ['BVPS', 'Net Debt', 'Cash Ratio', 'Equity Ratio'],
  },
  {
    id: 'cash_flow',
    label: 'Cash Flow',
    Icon: Activity,
    metrics: ['CFO / Net Income', 'Free Cash Flow', 'Capex Intensity (%)', 'FCF Coverage'],
  },
  {
    id: 'ratios',
    label: 'Ratios',
    Icon: Percent,
    metrics: [
      'ROE (%)',
      'DER',
      'Debt / EBITDA',
      'Dividend Yield (%)',
      'Payout Ratio (%)',
      'Market Cap',
      'Enterprise Value',
      'P/E',
      'P/BV',
      'P/S',
      'EV/EBITDA',
    ],
  },
];

const FUNDAMENTAL_VIEW_MODES = [
  { id: 'table', label: 'Table', Icon: Table2 },
  { id: 'chart', label: 'Chart', Icon: BarChart3 },
];

const METRIC_KEY_ALIASES = {
  Revenue: ['revenue'],
  EBITDA: ['ebitda'],
  'Net Profit': ['net_profit'],
  'Revenue Growth (%)': ['revenue_growth'],
  'Net Profit Growth (%)': ['net_profit_growth'],
  'EBITDA Margin (%)': ['ebitda_margin'],
  'Net Profit Margin (%)': ['net_profit_margin'],
  EPS: ['eps'],
  BVPS: ['bvps'],
  'Net Debt': ['net_debt'],
  'Cash Ratio': ['cash_ratio'],
  'Equity Ratio': ['equity_ratio'],
  'CFO / Net Income': ['cfo_to_net_income'],
  'Free Cash Flow': ['free_cash_flow'],
  'Capex Intensity (%)': ['capex_intensity_percent'],
  'FCF Coverage': ['fcf_coverage'],
  'ROE (%)': ['roe'],
  DER: ['der', 'balance_der'],
  'Debt / EBITDA': ['debt_to_ebitda'],
  'Dividend Yield (%)': ['dividend_yield', 'dividend_yield_percent'],
  'Payout Ratio (%)': ['payout_ratio', 'payout_ratio_percent'],
  'Market Cap': ['market_cap'],
  'Enterprise Value': ['enterprise_value'],
  'P/E': ['pe'],
  'P/BV': ['pbv'],
  'P/S': ['ps'],
  'EV/EBITDA': ['ev_ebitda'],
};

const METRIC_LABEL_ALIASES = {
  'Net Profit Margin (%)': ['Net Profit Margin / Profit Margin (%)'],
  'Dividend Yield (%)': ['Dividend Yield'],
  'Payout Ratio (%)': ['Payout Ratio'],
};

const METRIC_FORMAT_TYPES = {
  Revenue: 'currency_scaled',
  EBITDA: 'currency_scaled',
  'Net Profit': 'currency_scaled',
  'Revenue Growth (%)': 'percent',
  'Net Profit Growth (%)': 'percent',
  'EBITDA Margin (%)': 'percent',
  'Net Profit Margin (%)': 'percent',
  EPS: 'per_share',
  BVPS: 'per_share',
  'Net Debt': 'currency_scaled',
  'Cash Ratio': 'ratio',
  'Equity Ratio': 'ratio',
  'CFO / Net Income': 'ratio',
  'Free Cash Flow': 'currency_scaled',
  'Capex Intensity (%)': 'percent',
  'FCF Coverage': 'ratio',
  'ROE (%)': 'percent',
  DER: 'ratio',
  'Debt / EBITDA': 'ratio',
  'Dividend Yield (%)': 'percent',
  'Payout Ratio (%)': 'percent',
  'Market Cap': 'currency_scaled',
  'Enterprise Value': 'currency_scaled',
  'P/E': 'ratio',
  'P/BV': 'ratio',
  'P/S': 'ratio',
  'EV/EBITDA': 'ratio',
};

const LEGACY_FUNDAMENTAL_SECTIONS = [
  {
    key: 'valuation_multiples',
    title: 'VALUATION MULTIPLES',
    payloadKey: 'valuation_multiples',
    rows: [
      ['market_cap', 'Market Cap', 'currency_scaled'],
      ['enterprise_value', 'Enterprise Value', 'currency_scaled'],
      ['pe', 'P/E', 'ratio'],
      ['pbv', 'P/BV', 'ratio'],
      ['ps', 'P/S', 'ratio'],
      ['ev_ebitda', 'EV/EBITDA', 'ratio'],
    ],
  },
  {
    key: 'quality_of_earnings',
    title: 'QUALITY OF EARNINGS',
    payloadKey: 'quality_of_earnings',
    rows: [
      ['cfo_to_net_income', 'CFO / Net Income', 'ratio'],
      ['free_cash_flow', 'Free Cash Flow', 'currency_scaled'],
      ['capex_intensity_percent', 'Capex Intensity (%)', 'percent'],
    ],
  },
  {
    key: 'balance_sheet_risk',
    title: 'BALANCE SHEET RISK',
    payloadKey: 'balance_sheet_risk',
    rows: [
      ['der', 'DER', 'ratio'],
      ['net_debt', 'Net Debt', 'currency_scaled'],
      ['debt_to_ebitda', 'Debt / EBITDA', 'ratio'],
      ['cash_ratio', 'Cash Ratio', 'ratio'],
      ['equity_ratio', 'Equity Ratio', 'ratio'],
    ],
  },
  {
    key: 'dividend_quality',
    title: 'DIVIDEND QUALITY',
    payloadKey: 'dividend_quality',
    rows: [
      ['dividend_yield_percent', 'Dividend Yield', 'percent'],
      ['payout_ratio_percent', 'Payout Ratio', 'percent'],
      ['fcf_coverage', 'FCF Coverage', 'ratio'],
    ],
  },
];

function unitForFormat(formatType, financialHighlights) {
  if (formatType === 'currency_scaled') {
    return financialHighlights?.scale_label || financialHighlights?.currency || '';
  }
  if (formatType === 'percent') return '%';
  if (formatType === 'ratio') return 'x';
  if (formatType === 'per_share') return `${financialHighlights?.currency || ''}/share`;
  return '';
}

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

function sortPeriodsForChart(periods) {
  return [...periods].sort((left, right) =>
    periodSortValue(left).localeCompare(periodSortValue(right))
  );
}

function normalizeMetric(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function metricLabelCandidates(metricLabel) {
  return [metricLabel, ...(METRIC_LABEL_ALIASES[metricLabel] || [])].map(normalizeMetric);
}

function flattenFinancialRows(financialHighlights) {
  const sectionRows = Array.isArray(financialHighlights?.sections)
    ? financialHighlights.sections.flatMap((section) => section?.rows || [])
    : [];
  const rows = Array.isArray(financialHighlights?.rows) ? financialHighlights.rows : [];
  return [...sectionRows, ...rows].filter(Boolean);
}

function isUnavailableValue(value) {
  if (value === null || value === undefined || value === '') return true;
  return ['n/a', 'na', 'source unavailable', 'none', 'null', '-'].includes(
    String(value).trim().toLowerCase()
  );
}

function cellHasValue(cell) {
  if (!cell || cell.status === 'unavailable') return false;
  return !isUnavailableValue(cell.display ?? cell.value);
}

function parseDisplayNumber(value) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function chartCellValue(cell) {
  if (!cell || cell.status === 'unavailable') return 0;
  const displayNumber = parseDisplayNumber(cell.display);
  if (displayNumber !== null) return displayNumber;
  const number = Number(cell.value);
  return Number.isFinite(number) ? number : 0;
}

function chartCellDisplay(cell) {
  if (!cell || cell.status === 'unavailable') return '0';
  const display = cell.display ?? cell.value;
  return isUnavailableValue(display) ? '0' : String(display);
}

function rowValueScore(row, periods) {
  return periods.reduce(
    (score, period) => score + (cellHasValue(row.values?.[period.key]) ? 1 : 0),
    0
  );
}

function findMetricRow(financialHighlights, metricLabel, usedSourceRows) {
  const keyAliases = new Set(METRIC_KEY_ALIASES[metricLabel] || []);
  const labelAliases = new Set(metricLabelCandidates(metricLabel));

  return flattenFinancialRows(financialHighlights)
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (usedSourceRows.has(row)) return false;
      if (keyAliases.has(row.key)) return true;
      return labelAliases.has(normalizeMetric(row.label));
    })
    .sort(
      (left, right) =>
        rowValueScore(right.row, financialHighlights.periods || []) -
          rowValueScore(left.row, financialHighlights.periods || []) || left.index - right.index
    )[0]?.row;
}

function pointInTimeRow(financialHighlights, metricLabel, periods) {
  const keyAliases = new Set(METRIC_KEY_ALIASES[metricLabel] || []);
  const labelAliases = new Set(metricLabelCandidates(metricLabel));
  const item = (financialHighlights?.point_in_time || []).find(
    (snapshot) => keyAliases.has(snapshot.key) || labelAliases.has(normalizeMetric(snapshot.label))
  );
  const latestPeriodKey = periods[periods.length - 1]?.key;
  if (!item || !latestPeriodKey) return null;

  return {
    key: `${normalizeMetric(metricLabel).replace(/\s+/g, '_')}_point_in_time`,
    label: metricLabel,
    unit: item.unit || unitForFormat(METRIC_FORMAT_TYPES[metricLabel], financialHighlights),
    format_type: METRIC_FORMAT_TYPES[metricLabel],
    values: Object.fromEntries(
      periods.map((period) => [
        period.key,
        period.key === latestPeriodKey ? item : { ...UNAVAILABLE_CELL },
      ])
    ),
  };
}

function metricPlaceholderRow(financialHighlights, metricLabel, periods) {
  const key = normalizeMetric(metricLabel).replace(/\s+/g, '_');
  const formatType = METRIC_FORMAT_TYPES[metricLabel];
  return {
    key,
    label: metricLabel,
    unit: unitForFormat(formatType, financialHighlights),
    format_type: formatType,
    values: Object.fromEntries(periods.map((period) => [period.key, { ...UNAVAILABLE_CELL }])),
  };
}

function groupMetricRow(financialHighlights, metricLabel, periods, usedSourceRows) {
  const sourceRow = findMetricRow(financialHighlights, metricLabel, usedSourceRows);
  const snapshotRow = pointInTimeRow(financialHighlights, metricLabel, periods);
  if (sourceRow && rowValueScore(sourceRow, periods) === 0 && snapshotRow) return snapshotRow;

  if (sourceRow) {
    usedSourceRows.add(sourceRow);
    return {
      ...sourceRow,
      key: normalizeMetric(metricLabel).replace(/\s+/g, '_'),
      label: metricLabel,
      unit: sourceRow.unit || unitForFormat(METRIC_FORMAT_TYPES[metricLabel], financialHighlights),
      format_type: sourceRow.format_type || METRIC_FORMAT_TYPES[metricLabel],
      values: Object.fromEntries(
        periods.map((period) => [
          period.key,
          sourceRow.values?.[period.key] || { ...UNAVAILABLE_CELL },
        ])
      ),
    };
  }

  return snapshotRow || metricPlaceholderRow(financialHighlights, metricLabel, periods);
}

function groupFinancialHighlights(financialHighlights, group) {
  const periods = Array.isArray(financialHighlights?.periods) ? financialHighlights.periods : [];
  if (!periods.length || !group) return financialHighlights;

  const usedSourceRows = new Set();
  const rows = group.metrics.map((metricLabel) =>
    groupMetricRow(financialHighlights, metricLabel, periods, usedSourceRows)
  );

  return {
    ...financialHighlights,
    rows,
    point_in_time: [],
    sections: [
      {
        key: group.id,
        title: group.label,
        rows,
      },
    ],
  };
}

function legacyCell(payload, key) {
  const details = payload?.metric_details || {};
  const detail = details[key];
  if (detail && typeof detail === 'object') return detail;
  if (payload && Object.prototype.hasOwnProperty.call(payload, key)) {
    const value = payload[key];
    return value === null || value === undefined
      ? UNAVAILABLE_CELL
      : { value, display: String(value), status: 'reported' };
  }
  return UNAVAILABLE_CELL;
}

function appendLegacyFundamentalSections(financialHighlights, result) {
  const periods = Array.isArray(financialHighlights?.periods) ? financialHighlights.periods : [];
  const sections = Array.isArray(financialHighlights?.sections) ? financialHighlights.sections : [];
  if (!periods.length) return financialHighlights;

  const latestPeriodKey = periods[periods.length - 1]?.key;
  const extraSections = [];
  const extraRows = [];

  for (const sectionDefinition of LEGACY_FUNDAMENTAL_SECTIONS) {
    const payload = result?.[sectionDefinition.payloadKey];
    if (!payload) continue;

    const rows = sectionDefinition.rows.map(([key, label, formatType]) => {
      const row = {
        key,
        label,
        unit: unitForFormat(formatType, financialHighlights),
        format_type: formatType,
        section_key: sectionDefinition.key,
        values: Object.fromEntries(periods.map((period) => [period.key, { ...UNAVAILABLE_CELL }])),
      };
      if (latestPeriodKey) {
        row.values[latestPeriodKey] = legacyCell(payload, key);
      }
      extraRows.push(row);
      return row;
    });

    extraSections.push({
      key: sectionDefinition.key,
      title: sectionDefinition.title,
      rows,
    });
  }

  if (!extraSections.length) return financialHighlights;

  return {
    ...financialHighlights,
    rows: [...(financialHighlights.rows || []), ...extraRows],
    sections: [...sections, ...extraSections],
  };
}

function buildChartRows(financialHighlights) {
  const rows = Array.isArray(financialHighlights?.sections?.[0]?.rows)
    ? financialHighlights.sections[0].rows
    : financialHighlights?.rows || [];
  const periods = Array.isArray(financialHighlights?.periods)
    ? sortPeriodsForChart(financialHighlights.periods)
    : [];

  return {
    periods,
    rows: rows.map((row) => {
      const points = periods.map((period) => {
        const cell = row.values?.[period.key];
        return {
          periodKey: period.key,
          periodLabel: displayPeriodLabel(period),
          value: chartCellValue(cell),
          display: chartCellDisplay(cell),
        };
      });
      const values = points.map((point) => point.value);
      const minValue = Math.min(0, ...values);
      const maxValue = Math.max(0, ...values);
      const range = maxValue - minValue || 1;

      return {
        key: row.key,
        label: row.label,
        points,
        minValue,
        maxValue,
        range,
      };
    }),
  };
}

function FundamentalGroupChart({ financialHighlights, group }) {
  const chart = useMemo(() => buildChartRows(financialHighlights), [financialHighlights]);

  if (!chart.periods.length || !chart.rows.length) return null;

  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const slotWidth = plotWidth / chart.periods.length;
  const barWidth = Math.min(42, Math.max(10, slotWidth * 0.44));
  const chartHeight = CHART_TOP + chart.rows.length * CHART_ROW_HEIGHT + CHART_BOTTOM;
  const { title, unit_note: unitNote } = financialHighlights || {};

  return (
    <section className="space-y-4 border-b border-bloomberg-border bg-bloomberg-bg px-4 py-4">
      <div>
        <SectionHeader label={title || 'KEY FINANCIAL HIGHLIGHTS'} />
        {unitNote && <p className="font-mono text-[11px] text-bloomberg-muted">{unitNote}</p>}
      </div>

      <div>
        <div className="mb-2 font-mono text-xs uppercase tracking-wider text-bloomberg-orange">
          {group.label}
        </div>
        <div className="overflow-x-auto border border-bloomberg-border bg-black">
          <svg
            role="img"
            aria-label={`${group.label} fundamentals chart`}
            className="min-w-[980px] w-full font-mono"
            viewBox={`0 0 ${CHART_WIDTH} ${chartHeight}`}
            style={{ height: chartHeight }}
          >
            <rect width={CHART_WIDTH} height={chartHeight} fill="black" />

            {chart.periods.map((period, index) => {
              const x = CHART_LEFT + slotWidth * index + slotWidth / 2;
              return (
                <g key={period.key}>
                  <text
                    x={x}
                    y={24}
                    fill={CHART_ZERO_COLOR}
                    fontFamily="monospace"
                    fontSize="11"
                    textAnchor="middle"
                  >
                    {displayPeriodLabel(period)}
                  </text>
                  <line
                    x1={x}
                    x2={x}
                    y1={CHART_TOP}
                    y2={chartHeight - CHART_BOTTOM + 6}
                    stroke={CHART_GRID_COLOR}
                    strokeDasharray="4 6"
                  />
                </g>
              );
            })}

            {chart.rows.map((row, rowIndex) => {
              const rowTop = CHART_TOP + rowIndex * CHART_ROW_HEIGHT;
              const barTop = rowTop + CHART_BAR_TOP_OFFSET;
              const valueToY = (value) =>
                barTop + ((row.maxValue - value) / row.range) * CHART_BAR_HEIGHT;
              const zeroY = valueToY(0);

              return (
                <g key={row.key || row.label}>
                  <rect
                    x={0}
                    y={rowTop}
                    width={CHART_WIDTH}
                    height={CHART_ROW_HEIGHT}
                    fill={rowIndex % 2 === 0 ? '#050505' : 'transparent'}
                  />
                  <line
                    x1={0}
                    x2={CHART_WIDTH}
                    y1={rowTop + CHART_ROW_HEIGHT}
                    y2={rowTop + CHART_ROW_HEIGHT}
                    stroke={CHART_GRID_COLOR}
                  />
                  <text x={14} y={rowTop + 27} fill="#e5e5e5" fontFamily="monospace" fontSize="12">
                    {row.label}
                  </text>
                  <line
                    x1={CHART_LEFT}
                    x2={CHART_WIDTH - CHART_RIGHT}
                    y1={zeroY}
                    y2={zeroY}
                    stroke={CHART_AXIS_COLOR}
                  />
                  {row.points.map((point, pointIndex) => {
                    const x = CHART_LEFT + slotWidth * pointIndex + slotWidth / 2 - barWidth / 2;
                    const valueY = valueToY(point.value);
                    const barY = Math.min(valueY, zeroY);
                    const barHeight = Math.max(2, Math.abs(zeroY - valueY));
                    const fill =
                      point.value > 0
                        ? CHART_BAR_COLOR
                        : point.value < 0
                          ? CHART_NEGATIVE_COLOR
                          : CHART_ZERO_COLOR;

                    return (
                      <rect
                        key={`${row.key || row.label}-${point.periodKey}`}
                        x={x}
                        y={point.value === 0 ? zeroY - 1 : barY}
                        width={barWidth}
                        height={barHeight}
                        fill={fill}
                        opacity={point.value === 0 ? 0.7 : 0.9}
                        data-metric={row.label}
                        data-period={point.periodLabel}
                        data-value={point.value}
                      >
                        <title>
                          {row.label} {point.periodLabel}: {point.display}
                        </title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}

FundamentalGroupChart.propTypes = {
  financialHighlights: PropTypes.object,
  group: PropTypes.shape({
    label: PropTypes.string.isRequired,
  }).isRequired,
};

export default function FundamentalTab({ financialHighlights, result = {} }) {
  const [selectedFundamentalGroup, setSelectedFundamentalGroup] = useState('income');
  const [fundamentalViewMode, setFundamentalViewMode] = useState('table');
  const activeGroup =
    FUNDAMENTAL_GROUPS.find((group) => group.id === selectedFundamentalGroup) ||
    FUNDAMENTAL_GROUPS[0];
  const tablePayload = appendLegacyFundamentalSections(financialHighlights, result);
  const groupedTablePayload = groupFinancialHighlights(tablePayload, activeGroup);

  return (
    <>
      <div className="border-b border-bloomberg-border bg-black px-4 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {FUNDAMENTAL_GROUPS.map((group) => {
            const isActive = group.id === activeGroup.id;
            const Icon = group.Icon;
            return (
              <Button
                key={group.id}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                aria-pressed={isActive}
                onClick={() => setSelectedFundamentalGroup(group.id)}
                className={`h-10 whitespace-nowrap rounded-none border px-3 font-mono text-xs uppercase tracking-wider ${
                  isActive
                    ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-orange hover:text-bloomberg-white'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {group.label}
              </Button>
            );
          })}
        </div>
        <div
          className="mt-3 inline-flex overflow-hidden border border-bloomberg-border bg-bloomberg-bg"
          aria-label="Fundamental view mode"
        >
          {FUNDAMENTAL_VIEW_MODES.map((mode) => {
            const isActive = mode.id === fundamentalViewMode;
            const Icon = mode.Icon;
            return (
              <Button
                key={mode.id}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={isActive}
                onClick={() => setFundamentalViewMode(mode.id)}
                className={`h-8 gap-0 rounded-none border-0 px-3 font-mono text-xs uppercase tracking-wider [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                  isActive
                    ? 'bg-bloomberg-surface text-bloomberg-orange'
                    : 'bg-black text-bloomberg-muted hover:bg-bloomberg-card hover:text-bloomberg-white'
                }`}
              >
                <Icon className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                {mode.label}
              </Button>
            );
          })}
        </div>
      </div>
      {fundamentalViewMode === 'table' ? (
        <FinancialHighlightsTable financialHighlights={groupedTablePayload} />
      ) : (
        <FundamentalGroupChart financialHighlights={groupedTablePayload} group={activeGroup} />
      )}
    </>
  );
}

FundamentalTab.propTypes = {
  financialHighlights: PropTypes.object,
  result: PropTypes.object,
};
