import PropTypes from 'prop-types';
import React from 'react';

function chartPoints(values) {
  const cleanValues = values.map(Number).filter(Number.isFinite);
  const source = cleanValues.length ? cleanValues : [0, 0];
  const min = Math.min(...source);
  const max = Math.max(...source);
  const span = max - min || 1;
  const width = 120;
  const height = 32;

  return source
    .map((value, index) => {
      const x = source.length === 1 ? width : (index / (source.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function MiniSparkline({ values = [], positive = null }) {
  const colorClass =
    positive === true
      ? 'text-bloomberg-green'
      : positive === false
        ? 'text-bloomberg-red'
        : 'text-bloomberg-muted';

  return (
    <svg
      viewBox="0 0 120 32"
      className={`h-7 w-full ${colorClass}`}
      role="img"
      aria-label="sparkline"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={chartPoints(values)}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

MiniSparkline.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  positive: PropTypes.bool,
};
