import PropTypes from 'prop-types';

const WIDTH = 1000;
const HEIGHT = 280;
const PADDING = 24;

function buildChartPoints(points) {
  const usablePoints = points
    .map((point) => ({ ...point, close: Number(point.close) }))
    .filter((point) => Number.isFinite(point.close));

  if (usablePoints.length === 0) return null;

  const values = usablePoints.map((point) => point.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const horizontalRange = WIDTH - PADDING * 2;
  const verticalRange = HEIGHT - PADDING * 2;
  const denominator = Math.max(usablePoints.length - 1, 1);

  return usablePoints.map((point, index) => ({
    ...point,
    x: PADDING + (index / denominator) * horizontalRange,
    y: PADDING + ((max - point.close) / range) * verticalRange,
  }));
}

export default function PriceLineChart({ points }) {
  const chartPoints = buildChartPoints(points);

  if (!chartPoints) {
    return (
      <div className="h-72 border border-bloomberg-border bg-black p-3 font-mono text-xs text-bloomberg-muted">
        Price points are unavailable.
      </div>
    );
  }

  const polylinePoints = chartPoints.map(({ x, y }) => `${x},${y}`).join(' ');

  return (
    <div className="h-72 border border-bloomberg-border bg-black p-3">
      <svg
        role="img"
        aria-label="Close price chart"
        className="h-full w-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const y = PADDING + (step / 4) * (HEIGHT - PADDING * 2);
          return (
            <line
              key={step}
              x1={PADDING}
              x2={WIDTH - PADDING}
              y1={y}
              y2={y}
              stroke="#242424"
              strokeDasharray="6 6"
            />
          );
        })}
        <polyline
          fill="none"
          points={polylinePoints}
          stroke="#f97316"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </div>
  );
}

PriceLineChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
};
