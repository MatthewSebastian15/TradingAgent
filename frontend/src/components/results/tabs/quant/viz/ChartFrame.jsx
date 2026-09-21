import PropTypes from 'prop-types';
import { useState } from 'react';

import { linearScale, logScale } from './chartScale';
import { CHART_COLORS } from './chartTheme';
import { useElementWidth } from './useElementWidth';

const isDomain = (d) => Array.isArray(d) && d.length === 2 && d.every(Number.isFinite);

function Legend({ items }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-bloomberg-white/80">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 whitespace-nowrap">
          <svg width="14" height="8" aria-hidden="true">
            {item.swatch === 'box' ? (
              <rect width="14" height="8" fill={item.color} />
            ) : (
              <line
                x1="0"
                x2="14"
                y1="4"
                y2="4"
                stroke={item.color}
                strokeWidth="2"
                strokeDasharray={item.dashed ? '3 2' : undefined}
              />
            )}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

Legend.propTypes = { items: PropTypes.arrayOf(PropTypes.object).isRequired };

export function ChartFrame({
  title,
  subtitle,
  legend = [],
  ariaLabel,
  height = 240,
  xDomain,
  yDomain,
  yScaleType = 'linear',
  xTicks = [],
  yTicks = [],
  xLabel,
  yLabel,
  renderPlot,
  getTooltip,
  isEmpty = false,
  emptyMessage = 'Not enough data for this chart.',
  note,
}) {
  const [containerRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);

  const header = (title || subtitle || legend.length > 0) && (
    <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        {title && (
          <div className="text-xs tracking-wider text-bloomberg-orange uppercase">{title}</div>
        )}
        {subtitle && <div className="mt-0.5 text-[11px] text-bloomberg-white/80">{subtitle}</div>}
      </div>
      <Legend items={legend} />
    </div>
  );

  // A non-finite domain would put NaN in every SVG attribute, so treat it as empty.
  if (isEmpty || !isDomain(xDomain) || !isDomain(yDomain)) {
    return (
      <figure className="m-0 border border-bloomberg-border bg-black p-3 font-mono">
        {header}
        <div ref={containerRef} className="py-6 text-center text-[11px] text-bloomberg-white/80">
          {emptyMessage}
        </div>
      </figure>
    );
  }

  const padding = { top: 12, right: 16, bottom: xLabel ? 40 : 26, left: yLabel ? 78 : 64 };
  const plot = {
    left: padding.left,
    right: Math.max(padding.left + 1, width - padding.right),
    top: padding.top,
    bottom: height - padding.bottom,
  };
  plot.width = plot.right - plot.left;
  plot.height = plot.bottom - plot.top;
  const x = linearScale(xDomain, [plot.left, plot.right]);
  // Log is undefined for non-positive values; fall back to linear rather than emit NaN.
  const y =
    yScaleType === 'log' && yDomain[0] > 0 && yDomain[1] > 0
      ? logScale(yDomain, [plot.bottom, plot.top])
      : linearScale(yDomain, [plot.bottom, plot.top]);
  const xTickList = xTicks.filter((tick) => Number.isFinite(tick.value));
  const yTickList = yTicks.filter((tick) => Number.isFinite(tick.value));

  const handleMove = (event) => {
    if (!getTooltip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // The svg can be CSS-scaled (max-w-full); convert to viewBox pixels.
    const scale = rect.width > 0 ? width / rect.width : 1;
    const px = (event.clientX - rect.left) * scale;
    const py = (event.clientY - rect.top) * scale;
    if (px < plot.left || px > plot.right) {
      setHover(null);
      return;
    }
    const tip = getTooltip(x.invert(px), y.invert(py), { x, y });
    setHover(tip ? { ...tip, px: Number.isFinite(tip.x) ? x(tip.x) : px } : null);
  };

  return (
    <figure className="m-0 border border-bloomberg-border bg-black p-3 font-mono">
      {header}
      <div ref={containerRef} className="relative w-full">
        <svg
          role="img"
          aria-label={ariaLabel || title}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block max-w-full"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {yTickList.map((tick, i) => {
            const py = y(tick.value);
            return (
              <g key={`y-${i}-${tick.value}`}>
                <line
                  x1={plot.left}
                  x2={plot.right}
                  y1={py}
                  y2={py}
                  stroke={CHART_COLORS.grid}
                  strokeDasharray="3 5"
                />
                <text
                  x={plot.left - 8}
                  y={py + 3}
                  fill={CHART_COLORS.text}
                  fontSize="10"
                  textAnchor="end"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}
          <line
            x1={plot.left}
            x2={plot.right}
            y1={plot.bottom}
            y2={plot.bottom}
            stroke={CHART_COLORS.axis}
          />
          {xTickList.map((tick, i) => (
            <text
              key={`x-${i}-${tick.value}`}
              x={x(tick.value)}
              y={plot.bottom + 14}
              fill={CHART_COLORS.text}
              fontSize="10"
              textAnchor={i === 0 ? 'start' : i === xTickList.length - 1 ? 'end' : 'middle'}
            >
              {tick.label}
            </text>
          ))}
          {xLabel && (
            <text
              x={plot.right}
              y={plot.bottom + 30}
              fill={CHART_COLORS.text}
              fontSize="10"
              textAnchor="end"
            >
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text
              x={12}
              y={plot.top + plot.height / 2}
              fill={CHART_COLORS.text}
              fontSize="10"
              textAnchor="middle"
              transform={`rotate(-90 12 ${plot.top + plot.height / 2})`}
            >
              {yLabel}
            </text>
          )}
          {renderPlot({ x, y, plot })}
          {hover && (
            <line
              x1={hover.px}
              x2={hover.px}
              y1={plot.top}
              y2={plot.bottom}
              stroke={CHART_COLORS.crosshair}
              strokeDasharray="4 4"
              aria-hidden="true"
            />
          )}
        </svg>
        {hover && (
          <div
            data-testid="chart-tooltip"
            className="pointer-events-none absolute top-2 z-10 min-w-[128px] border border-bloomberg-border bg-black/95 px-2 py-1 text-[10px] leading-4"
            style={
              hover.px > width * 0.6 ? { right: width - hover.px + 8 } : { left: hover.px + 8 }
            }
          >
            <div className="text-bloomberg-orange">{hover.title}</div>
            {hover.rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 tabular-nums">
                <span style={{ color: row.color || CHART_COLORS.text }}>{row.label}</span>
                <span className="text-bloomberg-white">{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {note && <figcaption className="mt-2 text-[11px] text-bloomberg-white/80">{note}</figcaption>}
    </figure>
  );
}

ChartFrame.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  legend: PropTypes.arrayOf(PropTypes.object),
  ariaLabel: PropTypes.string,
  height: PropTypes.number,
  xDomain: PropTypes.arrayOf(PropTypes.number).isRequired,
  yDomain: PropTypes.arrayOf(PropTypes.number).isRequired,
  yScaleType: PropTypes.oneOf(['linear', 'log']),
  xTicks: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.number, label: PropTypes.string })),
  yTicks: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.number, label: PropTypes.string })),
  xLabel: PropTypes.string,
  yLabel: PropTypes.string,
  renderPlot: PropTypes.func.isRequired,
  getTooltip: PropTypes.func,
  isEmpty: PropTypes.bool,
  emptyMessage: PropTypes.string,
  note: PropTypes.node,
};
