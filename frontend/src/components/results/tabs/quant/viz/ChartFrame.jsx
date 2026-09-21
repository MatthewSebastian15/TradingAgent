import PropTypes from 'prop-types';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { linearScale, logScale } from './chartScale';
import { CHART_COLORS } from './chartTheme';
import { useElementWidth } from './useElementWidth';

const isDomain = (d) => Array.isArray(d) && d.length === 2 && d.every(Number.isFinite);

function Legend({ items }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-bloomberg-white/80">
      {items.map((item, i) => (
        <li key={`${i}-${item.label}`} className="flex items-center gap-1.5 whitespace-nowrap">
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
  const [tipWidth, setTipWidth] = useState(0);
  const tipRef = useRef(null);

  // A non-finite domain would put NaN in every SVG attribute, so treat it as empty.
  const ok = !isEmpty && isDomain(xDomain) && isDomain(yDomain);
  const [xd0, xd1] = ok ? xDomain : [0, 1];
  const [yd0, yd1] = ok ? yDomain : [0, 1];

  // Widest y tick label in characters, so the left margin can grow for labels like 'USD 600.00'.
  const maxYTickChars = yTicks.reduce((m, t) => Math.max(m, String(t?.label ?? '').length), 0);

  // Rebuilt only when geometry changes, not on every hover mousemove.
  const geo = useMemo(() => {
    if (!ok) return null;
    // 10px mono is ~6.2px per char; tick text ends 8px left of the plot, plus an edge gap.
    const tickRoom = Math.ceil(maxYTickChars * 6.2) + (yLabel ? 32 : 14);
    const padding = {
      top: 12,
      right: 16,
      bottom: xLabel ? 40 : 26,
      left: Math.max(yLabel ? 78 : 64, tickRoom),
    };
    const plot = {
      left: padding.left,
      right: Math.max(padding.left + 1, width - padding.right),
      top: padding.top,
      bottom: height - padding.bottom,
    };
    plot.width = plot.right - plot.left;
    plot.height = plot.bottom - plot.top;
    const x = linearScale([xd0, xd1], [plot.left, plot.right]);
    // Log is undefined for non-positive values; fall back to linear rather than emit NaN.
    const y =
      yScaleType === 'log' && yd0 > 0 && yd1 > 0
        ? logScale([yd0, yd1], [plot.bottom, plot.top])
        : linearScale([yd0, yd1], [plot.bottom, plot.top]);
    return { plot, x, y, content: renderPlot({ x, y, plot }) };
  }, [
    ok,
    width,
    height,
    xd0,
    xd1,
    yd0,
    yd1,
    yScaleType,
    xLabel,
    yLabel,
    maxYTickChars,
    renderPlot,
  ]);

  // No stale tooltip after a resize, data/domain change or empty-state switch.
  useLayoutEffect(() => {
    setHover(null);
  }, [ok, width, xd0, xd1, yd0, yd1]);
  // Measured after render so the tooltip can be clamped inside the container. The box is
  // w-max, so this is its natural width, not one squeezed by the container edge. `hover`
  // is a new object per move, so content changes re-measure too.
  useLayoutEffect(() => {
    setTipWidth(tipRef.current?.offsetWidth ?? 0);
  }, [hover, width]);

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

  if (!geo) {
    return (
      <figure className="m-0 min-w-0 border border-bloomberg-border bg-black p-3 font-mono">
        {header}
        <div ref={containerRef} className="py-6 text-center text-[11px] text-bloomberg-white/80">
          {emptyMessage}
        </div>
      </figure>
    );
  }

  const { plot, x, y, content } = geo;
  const xTickList = xTicks.filter((tick) => Number.isFinite(tick.value));
  const yTickList = yTicks.filter((tick) => Number.isFinite(tick.value));

  const handleMove = (event) => {
    if (!getTooltip) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // The svg can be CSS-scaled (max-w-full); convert to viewBox pixels.
    const scale = rect.width > 0 ? width / rect.width : 1;
    const px = (event.clientX - rect.left) * scale;
    const py = (event.clientY - rect.top) * scale;
    if (px < plot.left || px > plot.right || py < plot.top || py > plot.bottom) {
      setHover(null);
      return;
    }
    const tip = getTooltip(x.invert(px), y.invert(py), { x, y });
    setHover(tip ? { ...tip, px: Number.isFinite(tip.x) ? x(tip.x) : px } : null);
  };

  // Flip to the left of the pointer past 60% width, then clamp inside the container.
  const edgeMax = Math.max(8, width - tipWidth - 8);
  const tipStyle =
    hover && hover.px > width * 0.6
      ? { right: Math.min(Math.max(8, width - hover.px + 8), edgeMax) }
      : hover && { left: Math.min(Math.max(8, hover.px + 8), edgeMax) };

  return (
    <figure className="m-0 min-w-0 border border-bloomberg-border bg-black p-3 font-mono">
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
          {content}
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
            ref={tipRef}
            data-testid="chart-tooltip"
            className="pointer-events-none absolute top-2 z-10 w-max min-w-[128px] border border-bloomberg-border bg-black/95 px-2 py-1 text-[10px] leading-4"
            style={{ ...tipStyle, maxWidth: Math.max(0, width - 16) }}
          >
            <div className="text-bloomberg-orange">{hover.title}</div>
            {(hover.rows ?? []).map((row, i) => (
              <div key={`${i}-${row.label}`} className="flex justify-between gap-3 tabular-nums">
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
