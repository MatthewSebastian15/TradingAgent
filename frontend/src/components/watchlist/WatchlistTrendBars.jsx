import PropTypes from 'prop-types';
import React, { useMemo } from 'react';

const MAX_POINTS = 18;
const GAP = 2;
const MIN_BAR_HEIGHT = 4;

export default function WatchlistTrendBars({ values, positive = true, height = 28, width = 96 }) {
  const bars = useMemo(() => {
    const numbers = (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter(Number.isFinite)
      .slice(-MAX_POINTS);

    if (!numbers.length) return [];

    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const span = max - min;
    const barWidth = Math.max(2, (width - GAP * (numbers.length - 1)) / numbers.length);

    return numbers.map((value, index) => {
      const ratio = span === 0 ? 0.5 : (value - min) / span;
      const barHeight = Math.max(
        MIN_BAR_HEIGHT,
        ratio * (height - MIN_BAR_HEIGHT) + MIN_BAR_HEIGHT
      );
      return {
        value,
        x: index * (barWidth + GAP),
        y: height - barHeight,
        width: barWidth,
        height: barHeight,
      };
    });
  }, [height, values, width]);

  if (!bars.length) {
    return (
      <svg width={width} height={height} role="img" aria-label="No trend data" className="block">
        <line
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
          className="stroke-bloomberg-border"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={positive ? 'Positive trend' : 'Negative trend'}
      className="block"
    >
      {bars.map((bar, index) => (
        <rect
          key={`${bar.value}-${index}`}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx="1"
          className={positive ? 'fill-bloomberg-green' : 'fill-bloomberg-red'}
        />
      ))}
    </svg>
  );
}

WatchlistTrendBars.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  positive: PropTypes.bool,
  height: PropTypes.number,
  width: PropTypes.number,
};
