import PropTypes from 'prop-types';
import React from 'react';

function barHeights(values) {
  const cleanValues = values.map(Number).filter(Number.isFinite);
  const source = cleanValues.length ? cleanValues : [1, 1, 1, 1];
  const min = Math.min(...source);
  const max = Math.max(...source);
  const span = max - min || 1;
  return source.map((value) => 20 + ((value - min) / span) * 80);
}

export default function MiniTrendBars({ values, positive }) {
  const colorClass = positive ? 'bg-bloomberg-green' : 'bg-bloomberg-red';

  return (
    <div className="flex h-7 items-end gap-0.5" aria-label="trend bars">
      {barHeights(values).map((height, index) => (
        <span
          key={`${height}-${index}`}
          className={`block w-1.5 ${colorClass}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

MiniTrendBars.propTypes = {
  values: PropTypes.arrayOf(PropTypes.number),
  positive: PropTypes.bool,
};

MiniTrendBars.defaultProps = {
  values: [],
  positive: true,
};
