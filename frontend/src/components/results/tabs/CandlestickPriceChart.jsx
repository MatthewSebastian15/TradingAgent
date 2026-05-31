import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/formatting';
import {
  AXIS_COLOR,
  buildXAxisTicks,
  buildYAxisTicks,
  CROSSHAIR_COLOR,
  DOWN_COLOR,
  formatCompactNumber,
  GRID_COLOR,
  isUpCandle,
  LAST_PRICE_COLOR,
  normalizePricePoints,
  TEXT_COLOR,
  UP_COLOR,
} from './priceChartUtils';

const WIDTH = 1000;
const HEIGHT = 320;
const PADDING = {
  top: 24,
  right: 96,
  bottom: 38,
  left: 16,
};

function displayPrice(value, ticker) {
  return formatPrice(value, ticker) || 'N/A';
}

function formatChangePercent(point) {
  if (!point.open) return 'N/A';
  const value = ((point.close - point.open) / point.open) * 100;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function CandlestickTooltip({ point, ticker }) {
  const change = point.close - point.open;
  const up = isUpCandle(point);

  return (
    <div
      data-testid="candlestick-tooltip"
      className="pointer-events-none absolute left-4 top-4 z-10 border border-bloomberg-border bg-black/95 p-3 font-mono text-xs shadow-lg"
    >
      <div className="mb-2 text-bloomberg-orange tracking-wider uppercase">{point.date}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-bloomberg-muted">Open</span>
        <span className="text-right text-white">{displayPrice(point.open, ticker)}</span>
        <span className="text-bloomberg-muted">High</span>
        <span className="text-right text-white">{displayPrice(point.high, ticker)}</span>
        <span className="text-bloomberg-muted">Low</span>
        <span className="text-right text-white">{displayPrice(point.low, ticker)}</span>
        <span className="text-bloomberg-muted">Close</span>
        <span className="text-right text-white">{displayPrice(point.close, ticker)}</span>
        <span className="text-bloomberg-muted">Range</span>
        <span className="text-right text-white">
          {displayPrice(point.high - point.low, ticker)}
        </span>
        <span className="text-bloomberg-muted">Change</span>
        <span className={up ? 'text-right text-green-400' : 'text-right text-red-400'}>
          {displayPrice(change, ticker)}
        </span>
        <span className="text-bloomberg-muted">Change %</span>
        <span className={up ? 'text-right text-green-400' : 'text-right text-red-400'}>
          {formatChangePercent(point)}
        </span>
        <span className="text-bloomberg-muted">Volume</span>
        <span className="text-right text-white">{formatCompactNumber(point.volume)}</span>
      </div>
    </div>
  );
}

CandlestickTooltip.propTypes = {
  point: PropTypes.object.isRequired,
  ticker: PropTypes.string,
};

export default function CandlestickPriceChart({ points, ticker = '' }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const chart = useMemo(() => {
    const normalizedPoints = normalizePricePoints(points);
    if (normalizedPoints.length < 2) return null;

    const rawMin = Math.min(...normalizedPoints.map((item) => item.low));
    const rawMax = Math.max(...normalizedPoints.map((item) => item.high));
    const range = rawMax - rawMin;
    const paddingValue = range > 0 ? range * 0.08 : Math.max(rawMax * 0.02, 1);
    const yTicks = buildYAxisTicks(rawMin - paddingValue, rawMax + paddingValue);
    const minPrice = Math.min(...yTicks);
    const maxPrice = Math.max(...yTicks);

    return {
      points: normalizedPoints,
      minPrice,
      maxPrice,
      xTicks: buildXAxisTicks(normalizedPoints),
      yTicks,
    };
  }, [points]);

  if (!chart) {
    return (
      <div className="h-80 border border-bloomberg-border bg-black p-3 font-mono text-xs text-bloomberg-muted">
        Valid OHLC price chart data is not available for this analysis.
      </div>
    );
  }

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const step = plotWidth / chart.points.length;
  const candleWidth = Math.max(3, Math.min(14, step * 0.64));
  const priceToY = (price) => {
    const ratio = (chart.maxPrice - price) / (chart.maxPrice - chart.minPrice || 1);
    return PADDING.top + ratio * plotHeight;
  };
  const indexToX = (index) => PADDING.left + step * index + step / 2;
  const lastPoint = chart.points[chart.points.length - 1];
  const lastCloseY = priceToY(lastPoint.close);
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
    <div className="relative h-80 border border-bloomberg-border bg-black p-3">
      {hoverPoint && <CandlestickTooltip point={hoverPoint} ticker={ticker} />}
      <svg
        role="img"
        aria-label="OHLC candlestick price chart"
        className="h-full w-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {chart.yTicks.map((tick) => {
          const y = priceToY(tick);
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
                x={WIDTH - PADDING.right + 12}
                y={y + 4}
                fill={TEXT_COLOR}
                fontFamily="monospace"
                fontSize="11"
              >
                {displayPrice(tick, ticker)}
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
          const x = indexToX(index);
          const openY = priceToY(point.open);
          const closeY = priceToY(point.close);
          const rawBodyHeight = Math.abs(closeY - openY);
          const bodyHeight = Math.max(rawBodyHeight, 2);
          const bodyY = Math.min(openY, closeY) - (bodyHeight - rawBodyHeight) / 2;
          const color = isUpCandle(point) ? UP_COLOR : DOWN_COLOR;

          return (
            <g key={`${point.date}-${index}`}>
              <line
                x1={x}
                x2={x}
                y1={priceToY(point.high)}
                y2={priceToY(point.low)}
                stroke={color}
              />
              <rect
                x={x - candleWidth / 2}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                stroke={color}
              >
                <title>{`${point.date}: O ${point.open}, H ${point.high}, L ${point.low}, C ${point.close}, V ${point.volume ?? 'N/A'}`}</title>
              </rect>
            </g>
          );
        })}

        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={lastCloseY}
          y2={lastCloseY}
          stroke={LAST_PRICE_COLOR}
          strokeDasharray="3 5"
        />
        <text
          x={WIDTH - PADDING.right + 12}
          y={lastCloseY - 6}
          fill={LAST_PRICE_COLOR}
          fontFamily="monospace"
          fontSize="11"
        >
          {displayPrice(lastPoint.close, ticker)}
        </text>

        {hoverPoint && (
          <g>
            <line
              x1={indexToX(hoverIndex)}
              x2={indexToX(hoverIndex)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke={CROSSHAIR_COLOR}
              strokeDasharray="4 4"
            />
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={priceToY(hoverPoint.close)}
              y2={priceToY(hoverPoint.close)}
              stroke={CROSSHAIR_COLOR}
              strokeDasharray="4 4"
            />
          </g>
        )}

        {chart.xTicks.map(({ index, label }) => (
          <text
            key={`${index}-${label}`}
            x={indexToX(index)}
            y={HEIGHT - 10}
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

CandlestickPriceChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  ticker: PropTypes.string,
};
