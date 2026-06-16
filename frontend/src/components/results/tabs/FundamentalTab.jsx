import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Activity, BarChart3, Landmark, Percent, Table2, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import FinancialHighlightsTable from '../FinancialHighlightsTable';
import SectionHeader from '../SectionHeader';

const UNAVAILABLE_CELL = { value: null, display: '-', status: 'unavailable' };
const CHART_WIDTH = 1040;
const CHART_HEIGHT = 292;
const CHART_LEFT = 84;
const CHART_RIGHT = 78;
const CHART_TOP = 52;
const CHART_BOTTOM = 58;
const CHART_GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
const CHART_AXIS_COLOR = 'rgba(255, 255, 255, 0.18)';
const CHART_ZERO_COLOR = '#525252';
const CHART_SERIES_COLORS = ['#f97316', '#38bdf8', '#22c55e', '#a78bfa', '#facc15', '#fb7185'];
const CHART_TOOLTIP_MIN_WIDTH = 204;
const CHART_TOOLTIP_MAX_WIDTH = 320;
const CHART_TOOLTIP_HEIGHT = 58;

function metricLabelsForChart(chart) {
  return [...(chart.metrics || []), ...(chart.barMetrics || []), ...(chart.lineMetrics || [])];
}

const FUNDAMENTAL_CHART_GROUPS = [
  {
    id: 'income',
    label: 'Income',
    Icon: TrendingUp,
    charts: [
      {
        id: 'revenue_ebitda_net_profit',
        title: 'Revenue vs EBITDA vs Net Profit',
        type: 'grouped_bar',
        metrics: ['Revenue', 'EBITDA', 'Net Profit'],
      },
      {
        id: 'revenue_growth_net_profit_growth',
        title: 'Revenue Growth vs Net Profit Growth',
        type: 'line',
        metrics: ['Revenue Growth (%)', 'Net Profit Growth (%)'],
      },
      {
        id: 'ebitda_margin_net_profit_margin',
        title: 'EBITDA Margin vs Net Profit Margin',
        type: 'line',
        metrics: ['EBITDA Margin (%)', 'Net Profit Margin (%)'],
      },
      {
        id: 'eps_trend',
        title: 'EPS Trend',
        type: 'line',
        metrics: ['EPS'],
      },
    ],
  },
  {
    id: 'balance_sheet',
    label: 'Balance Sheet',
    Icon: Landmark,
    charts: [
      {
        id: 'net_debt_trend',
        title: 'Net Debt Trend',
        type: 'bar',
        metrics: ['Net Debt'],
        wide: true,
      },
      { id: 'bvps_trend', title: 'BVPS Trend', type: 'line', metrics: ['BVPS'] },
      {
        id: 'cash_ratio_equity_ratio',
        title: 'Cash Ratio vs Equity Ratio',
        type: 'line',
        metrics: ['Cash Ratio', 'Equity Ratio'],
      },
    ],
  },
  {
    id: 'cash_flow',
    label: 'Cash Flow',
    Icon: Activity,
    charts: [
      {
        id: 'free_cash_flow_trend',
        title: 'Free Cash Flow Trend',
        type: 'bar',
        metrics: ['Free Cash Flow'],
        wide: true,
      },
      {
        id: 'cfo_net_income_trend',
        title: 'CFO / Net Income Trend',
        type: 'line',
        metrics: ['CFO / Net Income'],
      },
      {
        id: 'capex_intensity_fcf_coverage',
        title: 'Capex Intensity vs FCF Coverage',
        type: 'line',
        metrics: ['Capex Intensity (%)', 'FCF Coverage'],
      },
    ],
  },
  {
    id: 'ratios',
    label: 'Ratios',
    Icon: Percent,
    charts: [
      { id: 'roe_trend', title: 'ROE Trend', type: 'line', metrics: ['ROE (%)'] },
      {
        id: 'leverage_risk',
        title: 'Leverage Risk',
        type: 'line',
        metrics: ['DER', 'Debt / EBITDA'],
      },
      {
        id: 'dividend_quality',
        title: 'Dividend Quality',
        type: 'line',
        metrics: ['Dividend Yield (%)', 'Payout Ratio (%)'],
      },
      {
        id: 'valuation_overview',
        title: 'Valuation Overview',
        type: 'mixed',
        barMetrics: ['Market Cap', 'Enterprise Value'],
        lineMetrics: ['P/E', 'P/BV', 'P/S', 'EV/EBITDA'],
      },
    ],
  },
];

const FUNDAMENTAL_GROUPS = FUNDAMENTAL_CHART_GROUPS.map(({ id, label, Icon, charts }) => ({
  id,
  label,
  Icon,
  charts,
  metrics: [...new Set(charts.flatMap(metricLabelsForChart))],
}));

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

function findRowForChartMetric(financialHighlights, metricLabel) {
  const keyAliases = new Set(METRIC_KEY_ALIASES[metricLabel] || []);
  const labelAliases = new Set(metricLabelCandidates(metricLabel));
  return flattenFinancialRows(financialHighlights).find(
    (row) => keyAliases.has(row.key) || labelAliases.has(normalizeMetric(row.label))
  );
}

function axisDomain(values, includeZero = false) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (!numericValues.length) return { min: 0, max: 1, range: 1 };

  let min = Math.min(...numericValues, includeZero ? 0 : Number.POSITIVE_INFINITY);
  let max = Math.max(...numericValues, includeZero ? 0 : Number.NEGATIVE_INFINITY);

  if (min === max) {
    const padding = Math.abs(max || 1) * 0.12;
    min -= padding;
    max += padding;
  }

  const padding = (max - min) * 0.08;
  return {
    min: min - padding,
    max: max + padding,
    range: max - min + padding * 2 || 1,
  };
}

function axisTicks(domain) {
  return [domain.max, domain.min + domain.range / 2, domain.min];
}

function formatAxisNumber(value) {
  if (!Number.isFinite(value)) return '0';
  const absolute = Math.abs(value);
  if (absolute >= 1000) return value.toFixed(0);
  if (absolute >= 100) return value.toFixed(1).replace(/\.0$/, '');
  if (absolute >= 10) return value.toFixed(1).replace(/\.0$/, '');
  return value
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function seriesRenderType(chartDefinition, metricLabel) {
  if (chartDefinition.type === 'mixed') {
    return chartDefinition.barMetrics?.includes(metricLabel) ? 'bar' : 'line';
  }
  return chartDefinition.type === 'bar' || chartDefinition.type === 'grouped_bar' ? 'bar' : 'line';
}

function buildMetricChart(financialHighlights, chartDefinition) {
  const periods = Array.isArray(financialHighlights?.periods)
    ? sortPeriodsForChart(financialHighlights.periods)
    : [];

  const series = metricLabelsForChart(chartDefinition).map((metricLabel, index) => {
    const row = findRowForChartMetric(financialHighlights, metricLabel);
    const points = periods.map((period) => {
      const cell = row?.values?.[period.key];
      return {
        periodKey: period.key,
        periodLabel: displayPeriodLabel(period),
        value: chartCellValue(cell),
        display: chartCellDisplay(cell),
      };
    });

    return {
      key: row?.key || normalizeMetric(metricLabel).replace(/\s+/g, '_'),
      label: metricLabel,
      renderType: seriesRenderType(chartDefinition, metricLabel),
      color: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length],
      points,
    };
  });

  return { periods, series };
}

function pointPath(points, yForValue, xForIndex) {
  return points
    .map(
      (point, index) => `${index === 0 ? 'M' : 'L'} ${xForIndex(index)} ${yForValue(point.value)}`
    )
    .join(' ');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function tooltipSize(point) {
  const longestText = Math.max(
    point.label?.length || 0,
    `${point.periodLabel || ''} ${point.display || ''}`.length
  );

  return {
    width: clamp(longestText * 7.4 + 44, CHART_TOOLTIP_MIN_WIDTH, CHART_TOOLTIP_MAX_WIDTH),
    height: CHART_TOOLTIP_HEIGHT,
  };
}

function tooltipPosition(point, size) {
  const margin = 10;
  const offset = 14;
  const bounds = {
    left: CHART_LEFT + margin,
    right: CHART_WIDTH - CHART_RIGHT - margin,
    top: CHART_TOP + margin,
    bottom: CHART_HEIGHT - CHART_BOTTOM - margin,
  };
  const preferRight = point.x < (bounds.left + bounds.right) / 2;
  const preferBelow = point.y < (bounds.top + bounds.bottom) / 2;
  const xOptions = preferRight
    ? [point.x + offset, point.x - size.width - offset]
    : [point.x - size.width - offset, point.x + offset];
  const yOptions = preferBelow
    ? [point.y + offset, point.y - size.height - offset]
    : [point.y - size.height - offset, point.y + offset];
  const candidates = [
    { x: xOptions[0], y: yOptions[0] },
    { x: xOptions[0], y: yOptions[1] },
    { x: xOptions[1], y: yOptions[0] },
    { x: xOptions[1], y: yOptions[1] },
    { x: point.x - size.width / 2, y: yOptions[0] },
    { x: point.x - size.width / 2, y: yOptions[1] },
  ];
  const fits = (candidate) =>
    candidate.x >= bounds.left &&
    candidate.x + size.width <= bounds.right &&
    candidate.y >= bounds.top &&
    candidate.y + size.height <= bounds.bottom;
  const overlapsPoint = (candidate) =>
    point.x >= candidate.x - margin &&
    point.x <= candidate.x + size.width + margin &&
    point.y >= candidate.y - margin &&
    point.y <= candidate.y + size.height + margin;
  const exact = candidates.find((candidate) => fits(candidate) && !overlapsPoint(candidate));
  if (exact) return exact;

  const clamped = candidates.map((candidate) => ({
    x: clamp(candidate.x, bounds.left, bounds.right - size.width),
    y: clamp(candidate.y, bounds.top, bounds.bottom - size.height),
  }));
  return clamped.find((candidate) => !overlapsPoint(candidate)) || clamped[0];
}

function ChartLegend({ series }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-3 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
      {series.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

ChartLegend.propTypes = {
  series: PropTypes.array.isRequired,
};

function FundamentalMetricChart({ financialHighlights, chartDefinition }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chart = useMemo(
    () => buildMetricChart(financialHighlights, chartDefinition),
    [financialHighlights, chartDefinition]
  );

  if (!chart.periods.length || !chart.series.length) return null;

  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  const barSeries = chart.series.filter((series) => series.renderType === 'bar');
  const lineSeries = chart.series.filter((series) => series.renderType === 'line');
  const isMixed = chartDefinition.type === 'mixed' && barSeries.length && lineSeries.length;
  const allValues = chart.series.flatMap((series) => series.points.map((point) => point.value));
  const barValues = barSeries.flatMap((series) => series.points.map((point) => point.value));
  const lineValues = lineSeries.flatMap((series) => series.points.map((point) => point.value));
  const singleDomain = axisDomain(allValues, chartDefinition.type !== 'line');
  const barDomain = isMixed ? axisDomain(barValues, true) : singleDomain;
  const lineDomain = isMixed ? axisDomain(lineValues, false) : singleDomain;
  const periodSlotWidth = plotWidth / chart.periods.length;
  const barSlotCenter = (index) => CHART_LEFT + periodSlotWidth * index + periodSlotWidth / 2;
  const lineX = barSlotCenter;
  const yForDomain = (domain) => (value) =>
    CHART_TOP + ((domain.max - value) / domain.range) * plotHeight;
  const yBar = yForDomain(barDomain);
  const yLine = yForDomain(lineDomain);
  const zeroY = yBar(0);
  const maxBarGroupWidth = chartDefinition.type === 'grouped_bar' || isMixed ? 124 : 64;
  const barGroupWidth = Math.min(maxBarGroupWidth, Math.max(18, periodSlotWidth * 0.66));
  const barWidth = Math.max(4, Math.min(34, barGroupWidth / Math.max(1, barSeries.length) - 3));
  const tooltipSizeValue = hoveredPoint ? tooltipSize(hoveredPoint) : null;
  const tooltip = hoveredPoint ? tooltipPosition(hoveredPoint, tooltipSizeValue) : null;

  return (
    <div className="overflow-hidden rounded-md border border-bloomberg-border bg-black">
      <div className="border-b border-bloomberg-border px-3 py-2">
        <div className="font-mono text-xs uppercase tracking-wider text-bloomberg-orange">
          {chartDefinition.title}
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
          {chartDefinition.type === 'mixed'
            ? 'Bars + Lines'
            : chartDefinition.type.replace('_', ' ')}
        </div>
      </div>
      <div className="overflow-hidden">
        <svg
          role="img"
          aria-label={`${chartDefinition.title} chart`}
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          className="block h-auto w-full font-mono"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <rect width={CHART_WIDTH} height={CHART_HEIGHT} fill="black" />

          {axisTicks(isMixed ? barDomain : singleDomain).map((tick) => {
            const y = (isMixed ? yBar : yForDomain(singleDomain))(tick);
            return (
              <g key={`left-${tick}`}>
                <line
                  x1={CHART_LEFT}
                  x2={CHART_WIDTH - CHART_RIGHT}
                  y1={y}
                  y2={y}
                  stroke={CHART_GRID_COLOR}
                />
                <text
                  x={CHART_LEFT - 12}
                  y={y + 4}
                  fill={CHART_ZERO_COLOR}
                  fontFamily="monospace"
                  fontSize="10"
                  textAnchor="end"
                >
                  {formatAxisNumber(tick)}
                </text>
              </g>
            );
          })}

          {isMixed &&
            axisTicks(lineDomain).map((tick) => {
              const y = yLine(tick);
              return (
                <text
                  key={`right-${tick}`}
                  x={CHART_WIDTH - CHART_RIGHT + 12}
                  y={y + 4}
                  fill={CHART_ZERO_COLOR}
                  fontFamily="monospace"
                  fontSize="10"
                  textAnchor="start"
                >
                  {formatAxisNumber(tick)}
                </text>
              );
            })}

          {chart.periods.map((period, index) => {
            const x = barSlotCenter(index);
            return (
              <g key={period.key}>
                <line
                  x1={x}
                  x2={x}
                  y1={CHART_TOP}
                  y2={CHART_HEIGHT - CHART_BOTTOM}
                  stroke={CHART_GRID_COLOR}
                  strokeDasharray="4 6"
                />
                <text
                  x={x}
                  y={CHART_HEIGHT - 24}
                  fill={CHART_ZERO_COLOR}
                  fontFamily="monospace"
                  fontSize="11"
                  textAnchor="middle"
                >
                  {displayPeriodLabel(period)}
                </text>
              </g>
            );
          })}

          <line
            x1={CHART_LEFT}
            x2={CHART_LEFT}
            y1={CHART_TOP}
            y2={CHART_HEIGHT - CHART_BOTTOM}
            stroke={CHART_AXIS_COLOR}
          />
          <line
            x1={CHART_LEFT}
            x2={CHART_WIDTH - CHART_RIGHT}
            y1={CHART_HEIGHT - CHART_BOTTOM}
            y2={CHART_HEIGHT - CHART_BOTTOM}
            stroke={CHART_AXIS_COLOR}
          />
          {isMixed && (
            <line
              x1={CHART_WIDTH - CHART_RIGHT}
              x2={CHART_WIDTH - CHART_RIGHT}
              y1={CHART_TOP}
              y2={CHART_HEIGHT - CHART_BOTTOM}
              stroke={CHART_AXIS_COLOR}
            />
          )}
          {barDomain.min < 0 && barDomain.max > 0 && (
            <line
              x1={CHART_LEFT}
              x2={CHART_WIDTH - CHART_RIGHT}
              y1={zeroY}
              y2={zeroY}
              stroke={CHART_AXIS_COLOR}
            />
          )}

          {barSeries.map((series, seriesIndex) =>
            series.points.map((point, pointIndex) => {
              const center = barSlotCenter(pointIndex);
              const x =
                center -
                (barWidth * barSeries.length + 3 * (barSeries.length - 1)) / 2 +
                seriesIndex * (barWidth + 3);
              const valueY = yBar(point.value);
              const baseY = yBar(0);
              const y = Math.min(valueY, baseY);
              const height = Math.max(2, Math.abs(baseY - valueY));
              const hoverPoint = {
                label: series.label,
                periodLabel: point.periodLabel,
                display: point.display,
                color: series.color,
                x: center,
                y: point.value === 0 ? baseY - 1 : valueY,
              };

              return (
                <rect
                  key={`${series.key}-${point.periodKey}`}
                  x={x}
                  y={point.value === 0 ? baseY - 1 : y}
                  width={barWidth}
                  height={height}
                  fill={series.color}
                  opacity={point.value === 0 ? 0.7 : 0.9}
                  data-metric={series.label}
                  data-period={point.periodLabel}
                  data-value={point.value}
                  tabIndex={0}
                  aria-label={`${series.label} ${point.periodLabel}: ${point.display}`}
                  onMouseEnter={() => setHoveredPoint(hoverPoint)}
                  onMouseMove={() => setHoveredPoint(hoverPoint)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  onFocus={() => setHoveredPoint(hoverPoint)}
                  onBlur={() => setHoveredPoint(null)}
                >
                  <title>
                    {series.label} {point.periodLabel}: {point.display}
                  </title>
                </rect>
              );
            })
          )}

          {lineSeries.map((series) => (
            <g key={series.key}>
              <path
                d={pointPath(series.points, isMixed ? yLine : yForDomain(singleDomain), lineX)}
                fill="none"
                stroke={series.color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {series.points.map((point, index) => {
                const x = lineX(index);
                const y = (isMixed ? yLine : yForDomain(singleDomain))(point.value);
                const hoverPoint = {
                  label: series.label,
                  periodLabel: point.periodLabel,
                  display: point.display,
                  color: series.color,
                  x,
                  y,
                };
                return (
                  <g key={`${series.key}-${point.periodKey}`}>
                    <circle cx={x} cy={y} r="3.5" fill={series.color} />
                    <circle
                      cx={x}
                      cy={y}
                      r="13"
                      fill="transparent"
                      data-metric={series.label}
                      data-period={point.periodLabel}
                      data-value={point.value}
                      tabIndex={0}
                      aria-label={`${series.label} ${point.periodLabel}: ${point.display}`}
                      onMouseEnter={() => setHoveredPoint(hoverPoint)}
                      onMouseMove={() => setHoveredPoint(hoverPoint)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onFocus={() => setHoveredPoint(hoverPoint)}
                      onBlur={() => setHoveredPoint(null)}
                    >
                      <title>
                        {series.label} {point.periodLabel}: {point.display}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </g>
          ))}

          {hoveredPoint && tooltip && (
            <g pointerEvents="none">
              <line
                x1={hoveredPoint.x}
                x2={hoveredPoint.x}
                y1={CHART_TOP}
                y2={CHART_HEIGHT - CHART_BOTTOM}
                stroke={hoveredPoint.color}
                strokeOpacity="0.35"
                strokeDasharray="3 5"
              />
              <g transform={`translate(${tooltip.x} ${tooltip.y})`}>
                <rect
                  width={tooltipSizeValue.width}
                  height={tooltipSizeValue.height}
                  rx="6"
                  fill="#050505"
                  stroke={hoveredPoint.color}
                  strokeOpacity="0.9"
                />
                <circle cx="14" cy="17" r="4" fill={hoveredPoint.color} />
                <text
                  x="26"
                  y="20"
                  fill="#f97316"
                  fontFamily="monospace"
                  fontSize="11"
                  fontWeight="700"
                >
                  {hoveredPoint.label}
                </text>
                <text x="14" y="40" fill="#d4d4d4" fontFamily="monospace" fontSize="11">
                  {hoveredPoint.periodLabel}
                </text>
                <text
                  x={tooltipSizeValue.width - 14}
                  y="40"
                  fill="#ffffff"
                  fontFamily="monospace"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="end"
                >
                  {hoveredPoint.display}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
      <ChartLegend series={chart.series} />
    </div>
  );
}

FundamentalMetricChart.propTypes = {
  financialHighlights: PropTypes.object,
  chartDefinition: PropTypes.shape({
    title: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    metrics: PropTypes.array,
    barMetrics: PropTypes.array,
    lineMetrics: PropTypes.array,
  }).isRequired,
};

function FundamentalChartsPanel({ financialHighlights, activeGroup }) {
  if (!Array.isArray(financialHighlights?.periods) || !financialHighlights.periods.length) {
    return null;
  }

  const { title, unit_note: unitNote } = financialHighlights || {};
  const groupedPayload = groupFinancialHighlights(financialHighlights, activeGroup);

  return (
    <section className="space-y-5 border-b border-bloomberg-border bg-bloomberg-bg px-4 py-4">
      <div>
        <SectionHeader label={title || 'KEY FINANCIAL HIGHLIGHTS'} />
        {unitNote && <p className="font-mono text-[11px] text-bloomberg-muted">{unitNote}</p>}
      </div>

      <div className="space-y-3">
        <div className="font-mono text-xs uppercase tracking-wider text-bloomberg-orange">
          {activeGroup.label}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {activeGroup.charts.map((chartDefinition) => (
            <div key={chartDefinition.id} className={chartDefinition.wide ? 'md:col-span-2' : ''}>
              <FundamentalMetricChart
                financialHighlights={groupedPayload}
                chartDefinition={chartDefinition}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

FundamentalChartsPanel.propTypes = {
  activeGroup: PropTypes.shape({
    label: PropTypes.string.isRequired,
    charts: PropTypes.array.isRequired,
  }).isRequired,
  financialHighlights: PropTypes.object,
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
                className={`h-10 whitespace-nowrap rounded-md border px-3 font-mono text-xs uppercase tracking-wider ${
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
      </div>
      <div className="border-b border-bloomberg-border bg-black px-4 py-3">
        <div className="flex gap-2" aria-label="Fundamental view mode">
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
                className={`h-8 gap-0 rounded-md border px-3 font-mono text-xs uppercase tracking-wider [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                  isActive
                    ? 'border-bloomberg-orange bg-bloomberg-surface text-bloomberg-orange'
                    : 'border-bloomberg-border bg-black text-bloomberg-muted hover:border-bloomberg-orange hover:bg-bloomberg-card hover:text-bloomberg-white'
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
        <FundamentalChartsPanel financialHighlights={tablePayload} activeGroup={activeGroup} />
      )}
    </>
  );
}

FundamentalTab.propTypes = {
  financialHighlights: PropTypes.object,
  result: PropTypes.object,
};
