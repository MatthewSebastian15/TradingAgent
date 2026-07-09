import {
  CHART_BOTTOM,
  CHART_HEIGHT,
  CHART_LEFT,
  CHART_RIGHT,
  CHART_SERIES_COLORS,
  CHART_TOOLTIP_HEIGHT,
  CHART_TOOLTIP_MAX_WIDTH,
  CHART_TOOLTIP_MIN_WIDTH,
  CHART_TOP,
  CHART_WIDTH,
  FUNDAMENTAL_TABLE_GROUPS,
  LEGACY_FUNDAMENTAL_SECTIONS,
  METRIC_FORMAT_TYPES,
  METRIC_KEY_ALIASES,
  METRIC_LABEL_ALIASES,
  UNAVAILABLE_CELL,
  metricLabelsForChart,
} from './config';
import { displayPeriodLabel } from '../../fundamentalPeriod';

export function unitForFormat(formatType, financialHighlights) {
  if (formatType === 'currency_scaled') {
    return financialHighlights?.scale_label || financialHighlights?.currency || '';
  }
  if (formatType === 'percent') return '%';
  if (formatType === 'ratio') return 'x';
  if (formatType === 'per_share') return `${financialHighlights?.currency || ''}/share`;
  if (formatType === 'number') return '';
  return '';
}

export function periodSortValue(period) {
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

export function sortPeriodsForChart(periods) {
  return [...periods].sort((left, right) =>
    periodSortValue(left).localeCompare(periodSortValue(right))
  );
}

export function normalizeMetric(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function metricLabelCandidates(metricLabel) {
  return [metricLabel, ...(METRIC_LABEL_ALIASES[metricLabel] || [])].map(normalizeMetric);
}

export function flattenFinancialRows(financialHighlights) {
  const sectionRows = Array.isArray(financialHighlights?.sections)
    ? financialHighlights.sections.flatMap((section) => section?.rows || [])
    : [];
  const rows = Array.isArray(financialHighlights?.rows) ? financialHighlights.rows : [];
  return [...sectionRows, ...rows].filter(Boolean);
}

export function isUnavailableValue(value) {
  if (value === null || value === undefined || value === '') return true;
  return ['n/a', 'na', 'source unavailable', 'none', 'null', '-'].includes(
    String(value).trim().toLowerCase()
  );
}

export function cellHasValue(cell) {
  if (!cell || cell.status === 'unavailable') return false;
  return !isUnavailableValue(cell.display ?? cell.value);
}

export function parseDisplayNumber(value) {
  const match = String(value || '')
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

export function chartCellValue(cell) {
  if (!cell || cell.status === 'unavailable') return null;
  const number = Number(cell.value);
  if (Number.isFinite(number)) return number;
  return parseDisplayNumber(cell.display);
}

export function chartCellDisplay(cell) {
  if (!cell || cell.status === 'unavailable') return 'N/A';
  const display = cell.display ?? cell.value;
  return isUnavailableValue(display) ? 'N/A' : String(display);
}

export function rowValueScore(row, periods) {
  return periods.reduce(
    (score, period) => score + (cellHasValue(row.values?.[period.key]) ? 1 : 0),
    0
  );
}

export function findMetricRow(financialHighlights, metricLabel, usedSourceRows) {
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

export function pointInTimeRow(financialHighlights, metricLabel, periods) {
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

export function metricPlaceholderRow(financialHighlights, metricLabel, periods) {
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

export function groupMetricRow(financialHighlights, metricLabel, periods, usedSourceRows) {
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

export function groupFinancialHighlights(financialHighlights, group) {
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

export function metricPlaceholderRowFromDefinition(financialHighlights, metricDefinition, periods) {
  return {
    key: metricDefinition.key,
    label: metricDefinition.label,
    unit: unitForFormat(metricDefinition.format, financialHighlights),
    format_type: metricDefinition.format,
    values: Object.fromEntries(periods.map((period) => [period.key, { ...UNAVAILABLE_CELL }])),
  };
}

export function groupTableMetricRow(
  financialHighlights,
  metricDefinition,
  periods,
  usedSourceRows
) {
  const sourceRow = findMetricRow(financialHighlights, metricDefinition.label, usedSourceRows);
  const snapshotRow = pointInTimeRow(financialHighlights, metricDefinition.label, periods);
  if (sourceRow && rowValueScore(sourceRow, periods) === 0 && snapshotRow) return snapshotRow;

  if (sourceRow) {
    usedSourceRows.add(sourceRow);
    return {
      ...sourceRow,
      key: metricDefinition.key,
      label: metricDefinition.label,
      unit: sourceRow.unit || unitForFormat(metricDefinition.format, financialHighlights),
      format_type: sourceRow.format_type || metricDefinition.format,
      values: Object.fromEntries(
        periods.map((period) => [
          period.key,
          sourceRow.values?.[period.key] || { ...UNAVAILABLE_CELL },
        ])
      ),
    };
  }

  return (
    snapshotRow ||
    metricPlaceholderRowFromDefinition(financialHighlights, metricDefinition, periods)
  );
}

export function groupFundamentalTableHighlights(financialHighlights, group) {
  const periods = Array.isArray(financialHighlights?.periods) ? financialHighlights.periods : [];
  const groupDefinitions = FUNDAMENTAL_TABLE_GROUPS[group?.id] || [];
  if (!periods.length || !group || !groupDefinitions.length) return financialHighlights;

  const usedSourceRows = new Set();
  const tableGroups = groupDefinitions.map((groupDefinition) => {
    const rows = groupDefinition.metrics.map((metricDefinition) =>
      groupTableMetricRow(financialHighlights, metricDefinition, periods, usedSourceRows)
    );

    return {
      key: normalizeMetric(groupDefinition.title).replace(/\s+/g, '_'),
      title: groupDefinition.title,
      rows,
    };
  });

  return {
    ...financialHighlights,
    rows: tableGroups.flatMap((tableGroup) => tableGroup.rows),
    point_in_time: [],
    sections: [
      {
        key: group.id,
        title: group.label,
        groups: tableGroups,
      },
    ],
  };
}

export function legacyCell(payload, key) {
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

export function appendLegacyFundamentalSections(financialHighlights, result) {
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

export function findRowForChartMetric(financialHighlights, metricLabel) {
  const keyAliases = new Set(METRIC_KEY_ALIASES[metricLabel] || []);
  const labelAliases = new Set(metricLabelCandidates(metricLabel));
  return flattenFinancialRows(financialHighlights).find(
    (row) => keyAliases.has(row.key) || labelAliases.has(normalizeMetric(row.label))
  );
}

export function axisDomain(values, includeZero = false) {
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

export function axisTicks(domain) {
  return [domain.max, domain.min + domain.range / 2, domain.min];
}

export function formatAxisNumber(value) {
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

export function seriesRenderType(chartDefinition, metricLabel) {
  if (chartDefinition.type === 'mixed') {
    return chartDefinition.barMetrics?.includes(metricLabel) ? 'bar' : 'line';
  }
  return chartDefinition.type === 'bar' || chartDefinition.type === 'grouped_bar' ? 'bar' : 'line';
}

export function buildMetricChart(financialHighlights, chartDefinition) {
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

export function pointPath(points, yForValue, xForIndex) {
  let hasOpenSegment = false;
  return points
    .map((point, index) => {
      if (!Number.isFinite(point.value)) {
        hasOpenSegment = false;
        return '';
      }
      const command = hasOpenSegment ? 'L' : 'M';
      hasOpenSegment = true;
      return `${command} ${xForIndex(index)} ${yForValue(point.value)}`;
    })
    .filter(Boolean)
    .join(' ');
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function tooltipSize(point) {
  const longestText = Math.max(
    point.label?.length || 0,
    `${point.periodLabel || ''} ${point.display || ''}`.length
  );

  return {
    width: clamp(longestText * 7.4 + 44, CHART_TOOLTIP_MIN_WIDTH, CHART_TOOLTIP_MAX_WIDTH),
    height: CHART_TOOLTIP_HEIGHT,
  };
}

export function tooltipPosition(point, size) {
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
