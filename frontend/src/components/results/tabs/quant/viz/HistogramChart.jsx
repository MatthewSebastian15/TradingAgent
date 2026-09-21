import PropTypes from 'prop-types';

import { ChartFrame } from './ChartFrame';
import { layoutLabels, niceTicks } from './chartScale';
import { CHART_COLORS } from './chartTheme';

const countLabel = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

export function HistogramChart({
  title,
  subtitle,
  ariaLabel,
  bins,
  formatX = (v) => v.toFixed(2),
  overlay = null,
  markers = [],
  height = 200,
  barColor = CHART_COLORS.primary,
  barLabel = 'Frequency',
  note,
  emptyMessage,
}) {
  const valid = (bins || [])
    .filter(
      (b) =>
        Number.isFinite(b.binStart) &&
        Number.isFinite(b.binEnd) &&
        b.binEnd > b.binStart &&
        Number.isFinite(b.count) &&
        b.count >= 0
    )
    .sort((a, b) => a.binStart - b.binStart);
  const total = valid.reduce((a, b) => a + b.count, 0);
  const marks = (markers || []).filter((m) => Number.isFinite(m.x));
  const isEmpty = valid.length === 0 || total === 0;

  let xDomain = [0, 1];
  let yDomain = [0, 1];
  let xTicks = [];
  let yTicks = [];
  let curve = [];
  if (!isEmpty) {
    const lo = Math.min(valid[0].binStart, ...marks.map((m) => m.x));
    const hi = Math.max(valid.at(-1).binEnd, ...marks.map((m) => m.x));
    xDomain = [lo, hi];
    // Assumes uniform bins: the normal overlay is scaled by the first bin's width.
    const binWidth = valid[0].binEnd - valid[0].binStart;
    const barMax = Math.max(...valid.map((b) => b.count));
    if (overlay && Number.isFinite(overlay.mu) && overlay.sigma > 0) {
      const steps = 80;
      curve = Array.from({ length: steps + 1 }, (_, i) => {
        const v = lo + ((hi - lo) * i) / steps;
        const pdf =
          Math.exp(-((v - overlay.mu) ** 2) / (2 * overlay.sigma ** 2)) /
          (overlay.sigma * Math.sqrt(2 * Math.PI));
        return { x: v, y: pdf * total * binWidth };
      });
      // A sigma that underflows gives NaN/Infinity; drop the curve rather than the chart.
      if (!curve.every((p) => Number.isFinite(p.y))) curve = [];
    }
    // A very narrow fit must not flatten the bars: cap its influence on the y range.
    const curveMax = curve.length ? Math.max(...curve.map((p) => p.y)) : 0;
    const maxY = Math.max(barMax, Math.min(curveMax, barMax * 1.5));
    const ticks = niceTicks(0, maxY, 4);
    yDomain = [0, Math.max(ticks.at(-1), maxY)];
    yTicks = ticks.map((v) => ({ value: v, label: countLabel(v) }));
    xTicks = niceTicks(lo, hi, 6)
      .filter((v) => v >= lo && v <= hi)
      .map((v) => ({ value: v, label: formatX(v) }));
  }

  const legend = [
    { label: barLabel, color: barColor, swatch: 'box' },
    ...(curve.length > 1 ? [{ label: 'Normal fit', color: CHART_COLORS.secondary }] : []),
  ];

  const getTooltip = (xValue) => {
    const bin = valid.find((b) => xValue >= b.binStart && xValue <= b.binEnd);
    if (!bin) return null;
    return {
      x: (bin.binStart + bin.binEnd) / 2,
      title: `${formatX(bin.binStart)} to ${formatX(bin.binEnd)}`,
      rows: [
        { label: 'Count', value: String(bin.count) },
        { label: 'Share', value: `${((bin.count / total) * 100).toFixed(1)}%` },
      ],
    };
  };

  const renderPlot = ({ x, y, plot }) => {
    // Stagger marker labels vertically so close markers never overprint each other.
    const labeled = layoutLabels(
      marks.map((m) => ({ ...m, x: x(m.x), y: plot.top + 10 })),
      { minDx: 80, maxY: plot.bottom - 2 }
    );
    return (
      <g>
        {valid.map((b, i) => {
          const x0 = x(b.binStart);
          const x1 = x(b.binEnd);
          const w = Math.max(1, x1 - x0 - 1);
          return (
            <rect
              key={`bar-${i}`}
              x={Math.min(x0 + 0.5, plot.right - w)}
              y={y(b.count)}
              width={w}
              height={Math.max(0, plot.bottom - y(b.count))}
              fill={barColor}
              opacity={0.65}
            />
          );
        })}
        {curve.length > 1 && (
          <path
            d={curve
              .map((p, i) => `${i === 0 ? 'M' : 'L'}${pt(x(p.x), Math.max(plot.top, y(p.y)))}`)
              .join('')}
            fill="none"
            stroke={CHART_COLORS.secondary}
            strokeWidth={1.5}
          />
        )}
        {labeled.map((m, i) => {
          const color = m.color || CHART_COLORS.warning;
          const nearRight = m.x > plot.right - 90;
          return (
            <g key={`mark-${i}`}>
              <line
                x1={m.x}
                x2={m.x}
                y1={plot.top}
                y2={plot.bottom}
                stroke={color}
                strokeDasharray="4 3"
                strokeWidth={1.25}
              />
              {m.label && (
                <text
                  x={nearRight ? m.x - 4 : m.x + 4}
                  y={m.labelY}
                  fill={color}
                  fontSize="10"
                  textAnchor={nearRight ? 'end' : 'start'}
                >
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={legend}
      ariaLabel={ariaLabel}
      height={height}
      xDomain={xDomain}
      yDomain={yDomain}
      xTicks={xTicks}
      yTicks={yTicks}
      renderPlot={renderPlot}
      getTooltip={getTooltip}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      note={note}
    />
  );
}

HistogramChart.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  ariaLabel: PropTypes.string,
  bins: PropTypes.arrayOf(
    PropTypes.shape({
      binStart: PropTypes.number,
      binEnd: PropTypes.number,
      count: PropTypes.number,
    })
  ).isRequired,
  formatX: PropTypes.func,
  overlay: PropTypes.shape({ mu: PropTypes.number, sigma: PropTypes.number }),
  markers: PropTypes.arrayOf(
    PropTypes.shape({ x: PropTypes.number, label: PropTypes.string, color: PropTypes.string })
  ),
  height: PropTypes.number,
  barColor: PropTypes.string,
  barLabel: PropTypes.string,
  note: PropTypes.node,
  emptyMessage: PropTypes.string,
};
