import PropTypes from 'prop-types';

import { ChartFrame } from './ChartFrame';
import { extent, layoutLabels, niceTicks, paddedDomain } from './chartScale';
import { CHART_COLORS } from './chartTheme';

const finitePoint = (p) => Number.isFinite(p.x) && Number.isFinite(p.y);
const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

// Splits a polyline into runs of consecutive finite points so a bad point is a gap.
function runsOf(points) {
  const runs = [];
  let cur = [];
  (points || []).forEach((p) => {
    if (finitePoint(p)) {
      cur.push(p);
    } else {
      if (cur.length) runs.push(cur);
      cur = [];
    }
  });
  if (cur.length) runs.push(cur);
  return runs;
}

export function ScatterChart({
  title,
  subtitle,
  ariaLabel,
  points = [],
  lines = [],
  formatX = (v) => v.toFixed(2),
  formatY = (v) => v.toFixed(2),
  xLabel,
  yLabel,
  height = 260,
  note,
  emptyMessage,
}) {
  const pts = points.filter(finitePoint);
  const segs = lines.map((l) => ({ ...l, runs: runsOf(l.points) })).filter((l) => l.runs.length);
  const linePts = segs.flatMap((l) => l.runs.flat());
  const xExt = extent([...pts.map((p) => p.x), ...linePts.map((p) => p.x)]);
  const yExt = extent([...pts.map((p) => p.y), ...linePts.map((p) => p.y)]);
  const isEmpty = !xExt || !yExt;

  let xDomain = [0, 1];
  let yDomain = [0, 1];
  let xTicks = [];
  let yTicks = [];
  if (!isEmpty) {
    const xp = paddedDomain(xExt);
    const yp = paddedDomain(yExt);
    const xt = niceTicks(xp[0], xp[1], 6);
    const yt = niceTicks(yp[0], yp[1], 5);
    xDomain = xt.length >= 2 ? [xt[0], xt.at(-1)] : xp;
    yDomain = yt.length >= 2 ? [yt[0], yt.at(-1)] : yp;
    xTicks = xt.map((v) => ({ value: v, label: formatX(v) }));
    yTicks = yt.map((v) => ({ value: v, label: formatY(v) }));
  }

  const legend = [];
  segs.forEach((l) => {
    if (l.label && !legend.some((item) => item.label === l.label)) {
      legend.push({ label: l.label, color: l.color, dashed: l.dashed });
    }
  });

  const getTooltip = (xv, yv, { x, y }) => {
    let best = null;
    for (const p of pts) {
      const d = Math.hypot(x(p.x) - x(xv), y(p.y) - y(yv));
      if (d <= 24 && (!best || d < best.d)) best = { p, d };
    }
    if (!best) return null;
    return {
      x: best.p.x,
      title: best.p.label || 'Point',
      rows: [
        { label: xLabel || 'x', value: formatX(best.p.x) },
        { label: yLabel || 'y', value: formatY(best.p.y) },
      ],
    };
  };

  const renderPlot = ({ x, y, plot }) => {
    const placed = pts.map((p) => ({ ...p, px: x(p.x), py: y(p.y) }));
    // Only labeled points take part in de-collision; the result maps back by index.
    const labeledIdx = placed.map((p, i) => (p.label ? i : -1)).filter((i) => i >= 0);
    const laidOut = layoutLabels(
      labeledIdx.map((i) => ({ i, x: placed[i].px, y: placed[i].py - 6 })),
      { minDx: 110, minY: plot.top + 8, maxY: plot.bottom - 2 }
    );
    const labelY = new Map(laidOut.map((l) => [l.i, l.labelY]));

    return (
      <g>
        {segs.map((l) => (
          <g key={l.id}>
            {l.runs
              .filter((run) => run.length > 1)
              .map((run, ri) => (
                <path
                  key={`run-${ri}`}
                  d={run.map((p, i) => `${i === 0 ? 'M' : 'L'}${pt(x(p.x), y(p.y))}`).join('')}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={1.75}
                  strokeDasharray={l.dashed ? '5 4' : undefined}
                />
              ))}
            {l.runs
              .filter((run) => run.length === 1)
              .map((run, ri) => (
                <circle key={`dot-${ri}`} cx={x(run[0].x)} cy={y(run[0].y)} r={2} fill={l.color} />
              ))}
          </g>
        ))}
        {placed.map((p, i) => {
          const color = p.color || CHART_COLORS.primary;
          const radius = p.radius > 0 ? p.radius : 4;
          const nearRight = p.px > plot.right - 110;
          return (
            <g key={`pt-${i}`}>
              <circle cx={p.px} cy={p.py} r={radius} fill={color}>
                <title>{`${p.label ? `${p.label}: ` : ''}${formatX(p.x)}, ${formatY(p.y)}`}</title>
              </circle>
              {p.label && (
                <text
                  x={nearRight ? p.px - 7 : p.px + 7}
                  y={labelY.get(i)}
                  fill={color}
                  fontSize="10"
                  textAnchor={nearRight ? 'end' : 'start'}
                >
                  {p.label}
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
      xLabel={xLabel}
      yLabel={yLabel}
      renderPlot={renderPlot}
      getTooltip={getTooltip}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      note={note}
    />
  );
}

ScatterChart.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  ariaLabel: PropTypes.string,
  points: PropTypes.arrayOf(
    PropTypes.shape({
      x: PropTypes.number,
      y: PropTypes.number,
      label: PropTypes.string,
      color: PropTypes.string,
      radius: PropTypes.number,
    })
  ),
  lines: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      color: PropTypes.string,
      dashed: PropTypes.bool,
      points: PropTypes.arrayOf(PropTypes.shape({ x: PropTypes.number, y: PropTypes.number })),
    })
  ),
  formatX: PropTypes.func,
  formatY: PropTypes.func,
  xLabel: PropTypes.string,
  yLabel: PropTypes.string,
  height: PropTypes.number,
  note: PropTypes.node,
  emptyMessage: PropTypes.string,
};
