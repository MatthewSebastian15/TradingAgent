import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import {
  CHART_AXIS_COLOR,
  CHART_BOTTOM,
  CHART_GRID_COLOR,
  CHART_HEIGHT,
  CHART_LEFT,
  CHART_RIGHT,
  CHART_TOP,
  CHART_WIDTH,
  CHART_ZERO_COLOR,
} from './config';
import {
  axisDomain,
  axisTicks,
  buildMetricChart,
  formatAxisNumber,
  groupFinancialHighlights,
  pointPath,
  tooltipPosition,
  tooltipSize,
} from './helpers';
import { displayPeriodLabel } from '../../fundamentalPeriod';
import SectionHeader from '../../SectionHeader';

export function ChartLegend({ series }) {
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

export function FundamentalMetricChart({ financialHighlights, chartDefinition }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chart = useMemo(
    () => buildMetricChart(financialHighlights, chartDefinition),
    [financialHighlights, chartDefinition]
  );

  const hasChartData = chart.series.some((series) =>
    series.points.some((point) => Number.isFinite(point.value))
  );

  if (!chart.periods.length || !chart.series.length || !hasChartData) {
    return (
      <div className="overflow-hidden rounded-md border border-bloomberg-border bg-black">
        <div className="border-b border-bloomberg-border px-3 py-2">
          <div className="font-mono text-xs uppercase tracking-wider text-bloomberg-orange">
            {chartDefinition.title}
          </div>
          {chartDefinition.description && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
              {chartDefinition.description}
            </div>
          )}
        </div>
        <div className="flex min-h-[292px] items-center justify-center px-4 py-8 font-mono text-xs uppercase tracking-wider text-bloomberg-muted">
          No fundamental data available
        </div>
      </div>
    );
  }

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
          {chartDefinition.description ||
            (chartDefinition.type === 'mixed'
              ? 'Bars + Lines'
              : chartDefinition.type.replace('_', ' '))}
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
              if (!Number.isFinite(point.value)) return null;
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
                if (!Number.isFinite(point.value)) return null;
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
    description: PropTypes.string,
    type: PropTypes.string.isRequired,
    metrics: PropTypes.array,
    barMetrics: PropTypes.array,
    lineMetrics: PropTypes.array,
  }).isRequired,
};

export function FundamentalChartsPanel({ financialHighlights, activeGroup }) {
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {activeGroup.charts.map((chartDefinition) => (
            <FundamentalMetricChart
              key={chartDefinition.id}
              financialHighlights={groupedPayload}
              chartDefinition={chartDefinition}
            />
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
