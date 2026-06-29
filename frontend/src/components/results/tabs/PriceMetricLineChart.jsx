import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import {
  buildXAxisTicks,
  buildYAxisTicks,
  CROSSHAIR_COLOR,
  formatXAxisDate,
  GRID_COLOR,
  LAST_PRICE_COLOR,
  TEXT_COLOR,
} from './priceChartUtils';

const WIDTH = 720;
const HEIGHT = 240;
const PADDING = {
  top: 24,
  right: 22,
  bottom: 30,
  left: 72,
};

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function compactCurrency(value, currency = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'N/A';

  const abs = Math.abs(number);
  const divisor =
    abs >= 1_000_000_000_000 ? 1_000_000_000_000 : abs >= 1_000_000_000 ? 1_000_000_000 : 1_000_000;
  const suffix = divisor === 1_000_000_000_000 ? 'T' : divisor === 1_000_000_000 ? 'B' : 'M';
  const amount = (number / divisor).toFixed(1);
  const normalizedCurrency = String(currency || '').toUpperCase();

  if (normalizedCurrency === 'IDR') return `Rp ${amount}${suffix}`;
  if (normalizedCurrency === 'HKD') return `HK$ ${amount}${suffix}`;
  if (normalizedCurrency === 'JPY') return `¥${amount}${suffix}`;
  if (normalizedCurrency === 'EUR') return `€${amount}${suffix}`;
  if (normalizedCurrency === 'GBP') return `£${amount}${suffix}`;
  if (normalizedCurrency === 'USD' || !normalizedCurrency) return `$${amount}${suffix}`;
  return `${normalizedCurrency} ${amount}${suffix}`;
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'N/A';
  return `${number.toFixed(2)}%`;
}

function plainNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : 'N/A';
}

function defaultFormatValue(value, valueType, currency) {
  if (valueType === 'currency') return compactCurrency(value, currency);
  if (valueType === 'number') return plainNumber(value);
  return percent(value);
}

export default function PriceMetricLineChart({
  title,
  subtitle,
  points,
  valueType = 'currency',
  currency = '',
  emptyMessage = 'Data is unavailable.',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const chart = useMemo(() => {
    const normalizedPoints = Array.isArray(points)
      ? points
          .map((point) => ({
            date: String(point?.date || ''),
            value: Number(point?.value),
          }))
          .filter((point) => point.date && Number.isFinite(point.value))
      : [];

    if (normalizedPoints.length < 2) return null;

    const values = normalizedPoints.map((point) => point.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const rawRange = rawMax - rawMin;
    const padding = rawRange > 0 ? rawRange * 0.08 : Math.max(Math.abs(rawMax) * 0.02, 1);
    const minValue = valueType === 'percent' ? Math.min(rawMin - padding, 0) : rawMin - padding;
    const maxValue = valueType === 'percent' ? Math.max(rawMax + padding, 0) : rawMax + padding;
    const yTicks = buildYAxisTicks(minValue, maxValue, 5);

    return {
      points: normalizedPoints,
      minValue: Math.min(...yTicks),
      maxValue: Math.max(...yTicks),
      xTicks: buildXAxisTicks(normalizedPoints),
      yTicks,
    };
  }, [points, valueType]);

  if (!chart) {
    return (
      <div className="min-h-[280px] border border-bloomberg-border bg-black p-3 font-mono">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">{title}</div>
        <div className="mt-1 text-[11px] text-bloomberg-muted">{emptyMessage}</div>
      </div>
    );
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const valueToY = (value) => {
    const ratio = (chart.maxValue - value) / (chart.maxValue - chart.minValue || 1);
    return PADDING.top + ratio * plotHeight;
  };
  const indexToX = (index) => PADDING.left + (index / (chart.points.length - 1)) * plotWidth;
  const path = chart.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${indexToX(index)} ${valueToY(point.value)}`)
    .join(' ');
  const lastPoint = chart.points.at(-1);
  const activeIndex = hoverIndex ?? chart.points.length - 1;
  const activePoint = chart.points[activeIndex] || lastPoint;
  const activeX = indexToX(activeIndex);
  const activeY = valueToY(activePoint.value);

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const rawIndex = Math.round(
      ((relativeX - PADDING.left) / plotWidth) * (chart.points.length - 1)
    );
    const nextIndex = Math.min(chart.points.length - 1, Math.max(0, rawIndex));
    setHoverIndex(nextIndex);
  };

  return (
    <div className="relative min-h-[280px] border border-bloomberg-border bg-black p-3 font-mono">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs tracking-wider text-bloomberg-orange uppercase">{title}</div>
          {subtitle && <div className="mt-1 text-[11px] text-bloomberg-muted">{subtitle}</div>}
        </div>
        <div className="text-right">
          <div className="text-[11px] text-bloomberg-muted">LAST</div>
          <div className="text-sm text-white">
            {defaultFormatValue(lastPoint.value, valueType, currency)}
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          role="img"
          aria-label={title}
          className="h-[240px] w-full"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="black" />

          {chart.yTicks.map((tick) => {
            const y = valueToY(tick);
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke={GRID_COLOR}
                  strokeDasharray="4 6"
                />
                <text
                  x={PADDING.left - 10}
                  y={y + 4}
                  fill={TEXT_COLOR}
                  fontFamily="monospace"
                  fontSize="10"
                  textAnchor="end"
                >
                  {defaultFormatValue(tick, valueType, currency)}
                </text>
              </g>
            );
          })}

          <path
            d={path}
            fill="none"
            stroke={LAST_PRICE_COLOR}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={activeX}
            x2={activeX}
            y1={PADDING.top}
            y2={HEIGHT - PADDING.bottom}
            stroke={CROSSHAIR_COLOR}
            strokeDasharray="4 4"
          />
          <circle cx={activeX} cy={activeY} r="4" fill={LAST_PRICE_COLOR} />

          {chart.xTicks.map(({ index, label }) => (
            <text
              key={`${index}-${label}`}
              x={indexToX(index)}
              y={HEIGHT - 8}
              fill={TEXT_COLOR}
              fontFamily="monospace"
              fontSize="10"
              textAnchor="middle"
            >
              {label || formatXAxisDate(chart.points[index]?.date)}
            </text>
          ))}
        </svg>

        {hasValue(activePoint?.value) && (
          <div
            data-testid="price-metric-tooltip"
            className="pointer-events-none absolute z-10 border border-bloomberg-border bg-black/95 px-2 py-1 font-mono text-[10px] leading-4 shadow-lg"
            style={{
              left: `${(activeX / WIDTH) * 100}%`,
              top: `${(activeY / HEIGHT) * 100}%`,
              transform:
                activeX > WIDTH * 0.72
                  ? 'translate(calc(-100% - 8px), -50%)'
                  : 'translate(8px, -50%)',
            }}
          >
            <div className="text-bloomberg-orange">{activePoint.date}</div>
            <div className="text-white">
              {defaultFormatValue(activePoint.value, valueType, currency)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

PriceMetricLineChart.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  points: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string,
      value: PropTypes.number,
    })
  ),
  valueType: PropTypes.oneOf(['currency', 'percent', 'number']),
  currency: PropTypes.string,
  emptyMessage: PropTypes.string,
};
