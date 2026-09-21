import PropTypes from 'prop-types';

import { ChartFrame } from './ChartFrame';
import {
  dateTicks,
  extent,
  layoutLabels,
  logTicks,
  nearestIndex,
  niceTicks,
  paddedDomain,
  timeToIso,
  toTime,
} from './chartScale';

const fmt1 = (n) => n.toFixed(1);
const pt = (x, y) => `${fmt1(x)},${fmt1(y)}`;

// Splits points (y === null marks a gap) into runs of consecutive valid points.
function segments(pts) {
  const out = [];
  let cur = [];
  pts.forEach((p) => {
    if (p.y === null) {
      if (cur.length) out.push(cur);
      cur = [];
    } else {
      cur.push(p);
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

function linePath(runs, x, y) {
  return runs
    .filter((run) => run.length > 1)
    .map((run) => run.map((p, i) => `${i === 0 ? 'M' : 'L'}${pt(x(p.x), y(p.y))}`).join(''))
    .join('');
}

function bandPath(pts, x, y) {
  const upper = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${pt(x(p.x), y(p.hi))}`).join('');
  const lower = [...pts]
    .reverse()
    .map((p) => `L${pt(x(p.x), y(p.lo))}`)
    .join('');
  return `${upper}${lower}Z`;
}

function markerShape(m, px, py) {
  const s = 5;
  if (m.shape === 'up') return `M${px - s},${py + s + 2}L${px + s},${py + s + 2}L${px},${py + 2}Z`;
  if (m.shape === 'down')
    return `M${px - s},${py - s - 2}L${px + s},${py - s - 2}L${px},${py - 2}Z`;
  return null;
}

export function LineChart({
  title,
  subtitle,
  ariaLabel,
  series = [],
  bands = [],
  referenceLines = [],
  verticalLines = [],
  regions = [],
  markers = [],
  xType = 'date',
  yScaleType = 'linear',
  formatX,
  formatY = (v) => v.toFixed(2),
  height = 240,
  includeZero = false,
  emptyMessage,
  note,
}) {
  const isDate = xType === 'date';
  const toX = isDate ? toTime : (v) => (Number.isFinite(v) ? v : null);
  // formatX always receives the public x unit: ISO string (date) or number.
  const fmtX = (v) => {
    const pub = isDate ? timeToIso(v) : v;
    return formatX ? formatX(pub) : String(pub);
  };
  const positive = (v) => Number.isFinite(v) && (yScaleType !== 'log' || v > 0);

  // Invalid/non-positive y becomes a gap (y = null) so the path breaks there.
  const lines = series
    .map((s) => {
      const pts = (s.points || [])
        .map((p) => ({ x: toX(p.x), y: positive(p.y) ? p.y : null }))
        .filter((p) => p.x !== null)
        .sort((a, b) => a.x - b.x);
      const valid = pts.filter((p) => p.y !== null);
      return { ...s, pts, runs: segments(pts), valid, xs: valid.map((p) => p.x) };
    })
    .filter((s) => s.valid.length > 0);
  const areas = bands
    .map((b) => {
      const pts = (b.points || [])
        .map((p) => ({ x: toX(p.x), lo: p.lo, hi: p.hi }))
        .filter((p) => p.x !== null && positive(p.lo) && positive(p.hi))
        .sort((a, b2) => a.x - b2.x);
      return { ...b, pts, xs: pts.map((p) => p.x) };
    })
    .filter((b) => b.pts.length > 1);

  const xExt = extent([...lines.flatMap((s) => s.xs), ...areas.flatMap((b) => b.xs)]);
  const yExt = extent([
    ...lines.flatMap((s) => s.valid.map((p) => p.y)),
    ...areas.flatMap((b) => b.pts.flatMap((p) => [p.lo, p.hi])),
    ...referenceLines.map((r) => r.y).filter(positive),
  ]);
  const isEmpty =
    !xExt ||
    !yExt ||
    xExt[0] === xExt[1] ||
    (lines.every((s) => s.valid.length < 2) && areas.length === 0);

  let xDomain = [0, 1];
  let yDomain = [0, 1];
  let xTicks = [];
  let yTicks = [];
  if (!isEmpty) {
    xDomain = xExt;
    if (yScaleType === 'log') {
      yDomain = [yExt[0] * 0.95, yExt[1] * 1.05];
      const ticks = logTicks(yDomain[0], yDomain[1]);
      yTicks = (ticks.length >= 2 ? ticks : [yExt[0], yExt[1]]).map((v) => ({
        value: v,
        label: formatY(v),
      }));
    } else {
      const padded = paddedDomain(yExt, { includeZero });
      const ticks = niceTicks(padded[0], padded[1], 5);
      yDomain = ticks.length >= 2 ? [ticks[0], ticks.at(-1)] : padded;
      yTicks = ticks.map((v) => ({ value: v, label: formatY(v) }));
    }
    xTicks = isDate
      ? dateTicks(xDomain).map((t) => (formatX ? { ...t, label: fmtX(t.value) } : t))
      : niceTicks(xDomain[0], xDomain[1], 6)
          .filter((v) => v >= xDomain[0] && v <= xDomain[1])
          .map((v) => ({ value: v, label: fmtX(v) }));
  }

  const legend = [];
  const seen = new Set();
  const addLegend = (item) => {
    if (!item.label || seen.has(item.label)) return;
    seen.add(item.label);
    legend.push(item);
  };
  lines
    .filter((s) => !s.hideInLegend)
    .forEach((s) => addLegend({ label: s.label, color: s.color, dashed: s.dashed }));
  areas.forEach((b) => addLegend({ label: b.label, color: b.color, swatch: 'box' }));
  referenceLines
    .filter((r) => positive(r.y))
    .forEach((r) => addLegend({ label: r.label, color: r.color, dashed: true }));
  verticalLines.forEach((v) => addLegend({ label: v.label, color: v.color, dashed: true }));
  regions.forEach((r) => addLegend({ label: r.label, color: r.color, swatch: 'box' }));

  const primary = lines.find((s) => !s.hideInLegend) || lines[0] || areas[0];
  const getTooltip = (xValue) => {
    if (!primary) return null;
    const idx = nearestIndex(primary.xs, xValue);
    if (idx < 0) return null;
    const snapped = primary.xs[idx];
    const rows = [
      ...lines
        .filter((s) => !s.hideInLegend)
        .map((s) => ({
          label: s.label || s.id,
          value: formatY(s.valid[nearestIndex(s.xs, snapped)].y),
          color: s.color,
        })),
      ...areas.map((b) => {
        const p = b.pts[nearestIndex(b.xs, snapped)];
        return { label: b.label || b.id, value: `${formatY(p.lo)} – ${formatY(p.hi)}` };
      }),
    ];
    return { x: snapped, title: fmtX(snapped), rows };
  };

  const renderPlot = ({ x, y, plot }) => {
    const inX = (px) => Number.isFinite(px) && px >= plot.left && px <= plot.right;
    const inY = (py) => Number.isFinite(py) && py >= plot.top && py <= plot.bottom;

    const placed = markers
      .map((m, i) => {
        const mx = toX(m.x);
        if (mx === null || !positive(m.y)) return null;
        const px = x(mx);
        const py = y(m.y);
        return inX(px) && inY(py) ? { m, i, px, py } : null;
      })
      .filter(Boolean);
    // Labels sit below 'up' markers and above the rest, then get staggered apart.
    const laidOut = layoutLabels(
      placed.map((p) => ({ ...p, x: p.px, y: p.m.shape === 'up' ? p.py + 20 : p.py - 12 }))
    );

    return (
      <g>
        {regions.map((r, i) => {
          const from = toX(r.from);
          const to = toX(r.to);
          if (from === null || to === null) return null;
          const x0 = Math.max(plot.left, x(from));
          const x1 = Math.min(plot.right, x(to));
          return x1 > x0 ? (
            <rect
              key={`region-${i}`}
              x={x0}
              y={plot.top}
              width={x1 - x0}
              height={plot.height}
              fill={r.color}
              opacity={0.22}
            />
          ) : null;
        })}
        {areas.map((b) => (
          <path key={b.id} d={bandPath(b.pts, x, y)} fill={b.color} stroke="none" />
        ))}
        {referenceLines.map((r, i) => {
          if (!positive(r.y) || !inY(y(r.y))) return null;
          return (
            <line
              key={`ref-${i}`}
              x1={plot.left}
              x2={plot.right}
              y1={y(r.y)}
              y2={y(r.y)}
              stroke={r.color}
              strokeDasharray="5 4"
            />
          );
        })}
        {verticalLines.map((v, i) => {
          const vx = toX(v.x);
          const px = vx === null ? NaN : x(vx);
          return inX(px) ? (
            <line
              key={`v-${i}`}
              x1={px}
              x2={px}
              y1={plot.top}
              y2={plot.bottom}
              stroke={v.color}
              strokeDasharray="5 4"
            />
          ) : null;
        })}
        {lines.map((s) => {
          const d = linePath(s.runs, x, y);
          return (
            <g key={s.id}>
              {d && (
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.width || 1.75}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  strokeLinejoin="round"
                />
              )}
              {s.runs
                .filter((run) => run.length === 1)
                .map((run) => (
                  <circle
                    key={`dot-${run[0].x}`}
                    cx={x(run[0].x)}
                    cy={y(run[0].y)}
                    r={2}
                    fill={s.color}
                  />
                ))}
            </g>
          );
        })}
        {laidOut.map(({ m, i, px, py, labelY }) => {
          const d = markerShape(m, px, py);
          const anchor = px < plot.left + 40 ? 'start' : px > plot.right - 40 ? 'end' : 'middle';
          return (
            <g key={`m-${i}`}>
              {d ? (
                <path d={d} fill={m.color}>
                  <title>{m.label}</title>
                </path>
              ) : (
                <circle cx={px} cy={py} r={3.5} fill={m.color}>
                  <title>{m.label}</title>
                </circle>
              )}
              {m.label && (
                <text
                  x={px}
                  y={Math.min(plot.bottom - 2, Math.max(plot.top + 8, labelY))}
                  fill={m.color}
                  fontSize="9"
                  textAnchor={anchor}
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
      yScaleType={yScaleType}
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

const xValue = PropTypes.oneOfType([PropTypes.string, PropTypes.number]);

LineChart.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  ariaLabel: PropTypes.string,
  series: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      color: PropTypes.string.isRequired,
      width: PropTypes.number,
      dashed: PropTypes.bool,
      hideInLegend: PropTypes.bool,
      points: PropTypes.arrayOf(PropTypes.shape({ x: xValue, y: PropTypes.number })).isRequired,
    })
  ),
  bands: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      color: PropTypes.string.isRequired,
      points: PropTypes.arrayOf(
        PropTypes.shape({ x: xValue, lo: PropTypes.number, hi: PropTypes.number })
      ),
    })
  ),
  referenceLines: PropTypes.arrayOf(
    PropTypes.shape({ y: PropTypes.number, label: PropTypes.string, color: PropTypes.string })
  ),
  verticalLines: PropTypes.arrayOf(
    PropTypes.shape({ x: xValue, label: PropTypes.string, color: PropTypes.string })
  ),
  regions: PropTypes.arrayOf(
    PropTypes.shape({
      from: xValue,
      to: xValue,
      color: PropTypes.string,
      label: PropTypes.string,
    })
  ),
  markers: PropTypes.arrayOf(
    PropTypes.shape({
      x: xValue,
      y: PropTypes.number,
      shape: PropTypes.oneOf(['up', 'down', 'dot']),
      color: PropTypes.string,
      label: PropTypes.string,
    })
  ),
  xType: PropTypes.oneOf(['date', 'number']),
  yScaleType: PropTypes.oneOf(['linear', 'log']),
  formatX: PropTypes.func,
  formatY: PropTypes.func,
  height: PropTypes.number,
  includeZero: PropTypes.bool,
  emptyMessage: PropTypes.string,
  note: PropTypes.node,
};
