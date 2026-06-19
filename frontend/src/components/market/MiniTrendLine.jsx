import PropTypes from 'prop-types';
import React, { useMemo } from 'react';

function buildPoints(values) {
  const cleanValues = values.map(Number).filter(Number.isFinite);
  const source = cleanValues.length > 1 ? cleanValues : [1, 1, 1, 1, 1];
  const min = Math.min(...source);
  const max = Math.max(...source);
  const span = max - min || 1;
  const lastIndex = source.length - 1 || 1;

  return source
    .map((value, index) => {
      const x = (index / lastIndex) * 100;
      const y = 28 - ((value - min) / span) * 24;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export default function MiniTrendLine({ values, positive }) {
  const points = useMemo(() => buildPoints(values), [values]);
  const colorClass = positive ? 'text-bloomberg-green' : 'text-bloomberg-red';

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={`h-6 w-20 ${colorClass}`}
      aria-label="trend line"
      role="img"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

MiniTrendLine.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  positive: PropTypes.bool,
};

MiniTrendLine.defaultProps = {
  values: [],
  positive: true,
};
