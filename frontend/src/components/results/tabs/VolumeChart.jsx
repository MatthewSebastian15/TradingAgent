import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import {
  AXIS_COLOR,
  buildXAxisTicks,
  formatCompactNumber,
  getNiceStep,
  GRID_COLOR,
  movementColor,
  movementLabel,
  normalizePricePoints,
  TEXT_COLOR,
} from './priceChartUtils';

const WIDTH = 1000;
const HEIGHT = 220;
const PADDING = {
  top: 16,
  right: 84,
  bottom: 32,
  left: 16,
};

function VolumeTooltip({ point, previousPoint }) {
  const direction = movementLabel(point, previousPoint);
  const up = direction === 'UP';
  const directionClass = up
    ? 'text-right text-green-400'
    : direction === 'DOWN'
      ? 'text-right text-red-400'
      : 'text-right text-bloomberg-muted';

  return (
    <div
      data-testid="volume-tooltip"
      className="pointer-events-none absolute left-4 top-4 z-10 border border-bloomberg-border bg-black/95 p-3 font-mono text-xs shadow-lg"
    >
      <div className="mb-2 text-bloomberg-orange tracking-wider uppercase">{point.date}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-bloomberg-muted">Volume</span>
        <span className="text-right text-white">{formatCompactNumber(point.volume)}</span>
        <span className="text-bloomberg-muted">Direction</span>
        <span className={directionClass}>{direction}</span>
      </div>
    </div>
  );
}

VolumeTooltip.propTypes = {
  point: PropTypes.object.isRequired,
  previousPoint: PropTypes.object,
};

export default function VolumeChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const chart = useMemo(() => {
    const normalizedPoints = normalizePricePoints(points);
    if (normalizedPoints.length === 0) return null;

    const maxVolume = Math.max(...normalizedPoints.map((point) => point.volume || 0), 1);
    const step = getNiceStep(maxVolume * 1.08, 5);
    const maxAxisVolume = Math.ceil((maxVolume * 1.08) / step) * step;
    const yTicks = [];

    for (let value = maxAxisVolume; value >= 0; value -= step) {
      yTicks.push(value);
    }

    return {
      points: normalizedPoints,
      maxAxisVolume,
      xTicks: buildXAxisTicks(normalizedPoints),
      yTicks,
    };
  }, [points]);

  if (!chart) {
    return (
      <div className="h-56 border border-bloomberg-border bg-black p-3 font-mono text-xs text-bloomberg-muted">
        Volume points are unavailable.
      </div>
    );
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const step = plotWidth / chart.points.length;
  const barWidth = Math.max(1, Math.min(14, step * 0.68));
  const indexToX = (index) => PADDING.left + step * index + step / 2;
  const volumeToY = (volume) =>
    PADDING.top + ((chart.maxAxisVolume - volume) / chart.maxAxisVolume) * plotHeight;
  const hoverPoint = hoverIndex === null ? null : chart.points[hoverIndex];

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const relativeY = ((event.clientY - rect.top) / rect.height) * HEIGHT;

    if (
      relativeX < PADDING.left ||
      relativeX > WIDTH - PADDING.right ||
      relativeY < PADDING.top ||
      relativeY > HEIGHT - PADDING.bottom
    ) {
      setHoverIndex(null);
      return;
    }

    const index = Math.round((relativeX - PADDING.left - step / 2) / step);
    setHoverIndex(index >= 0 && index < chart.points.length ? index : null);
  };

  return (
    <div className="relative h-56 border border-bloomberg-border bg-black p-3">
      {hoverPoint && (
        <VolumeTooltip point={hoverPoint} previousPoint={chart.points[hoverIndex - 1]} />
      )}
      <svg
        role="img"
        aria-label="Trading volume chart"
        className="h-full w-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {chart.yTicks.map((tick) => {
          const y = volumeToY(tick);
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke={GRID_COLOR}
                strokeDasharray="5 6"
              />
              <text
                x={WIDTH - PADDING.right + 10}
                y={y + 4}
                fill={TEXT_COLOR}
                fontFamily="monospace"
                fontSize="10"
              >
                {formatCompactNumber(tick)}
              </text>
            </g>
          );
        })}

        <line
          x1={WIDTH - PADDING.right}
          x2={WIDTH - PADDING.right}
          y1={PADDING.top}
          y2={HEIGHT - PADDING.bottom}
          stroke={AXIS_COLOR}
        />

        {chart.points.map((point, index) => {
          const volume = point.volume || 0;
          const y = volumeToY(volume);
          const height = HEIGHT - PADDING.bottom - y;
          const direction = movementLabel(point, chart.points[index - 1]);
          return (
            <rect
              key={`${point.date}-${index}`}
              x={indexToX(index) - barWidth / 2}
              y={y}
              width={barWidth}
              height={height}
              fill={movementColor(point, chart.points[index - 1])}
              opacity="0.8"
            >
              <title>{`${point.date}: ${formatCompactNumber(point.volume)} ${direction}`}</title>
            </rect>
          );
        })}

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
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

VolumeChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
};
