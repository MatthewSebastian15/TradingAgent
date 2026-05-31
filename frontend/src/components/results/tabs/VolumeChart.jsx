import PropTypes from 'prop-types';

const WIDTH = 1000;
const HEIGHT = 220;
const PADDING = 12;

export default function VolumeChart({ points }) {
  const volumePoints = points
    .map((point) => ({ ...point, volume: Number(point.volume) }))
    .filter((point) => Number.isFinite(point.volume) && point.volume >= 0);

  if (volumePoints.length === 0) {
    return (
      <div className="h-56 border border-bloomberg-border bg-black p-3 font-mono text-xs text-bloomberg-muted">
        Volume points are unavailable.
      </div>
    );
  }

  const maxVolume = Math.max(...volumePoints.map((point) => point.volume), 1);
  const chartWidth = WIDTH - PADDING * 2;
  const chartHeight = HEIGHT - PADDING * 2;
  const slotWidth = chartWidth / volumePoints.length;
  const barWidth = Math.max(slotWidth * 0.7, 1);

  return (
    <div className="h-56 border border-bloomberg-border bg-black p-3">
      <svg
        role="img"
        aria-label="Trading volume chart"
        className="h-full w-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
      >
        {volumePoints.map((point, index) => {
          const height = (point.volume / maxVolume) * chartHeight;
          return (
            <rect
              key={`${point.date}-${index}`}
              x={PADDING + index * slotWidth + (slotWidth - barWidth) / 2}
              y={HEIGHT - PADDING - height}
              width={barWidth}
              height={height}
              fill="#06b6d4"
              opacity="0.8"
            >
              <title>{`${point.date}: ${point.volume}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

VolumeChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
};
