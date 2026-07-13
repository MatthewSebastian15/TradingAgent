import PropTypes from 'prop-types';
import React, { useMemo, useState } from 'react';

import {
  AXIS_COLOR,
  buildXAxisTicks,
  buildYAxisTicks,
  CROSSHAIR_COLOR,
  formatCompactNumber,
  GRID_COLOR,
  isUpCandle,
  LAST_PRICE_COLOR,
  movementColor,
  normalizePricePoints,
  TEXT_COLOR,
} from './priceChartUtils';
import { formatPrice } from '../../../utils/formatting';

const WIDTH = 1000;
const HEIGHT = 420;
const PRICE_HEIGHT = 292;
const VOLUME_HEIGHT = 82;
const VOLUME_TOP = 312;
const PADDING = {
  top: 24,
  right: 28,
  bottom: 32,
  left: 116,
};

function dynamicSeriesWidth(step, rangeKey, type = 'candle') {
  const minimum = type === 'volume' ? 1.5 : 3;
  const denseGap = rangeKey === '1W' ? 4 : rangeKey === '1M' ? 5 : null;
  if (denseGap !== null) return Math.max(minimum, step - denseGap);
  return Math.max(minimum, Math.min(18, step * 0.72));
}

function displayPrice(value, ticker) {
  return formatPrice(value, ticker) || 'N/A';
}

function formatChangePercent(point, previousPoint) {
  const reference = previousPoint?.close ?? point.open;
  if (!reference) return 'N/A';
  const value = ((point.close - reference) / reference) * 100;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function CandlestickTooltip({ point, previousPoint, ticker, position }) {
  const change = point.close - (previousPoint?.close ?? point.open);
  const up = isUpCandle(point, previousPoint);
  const changeClass = up ? 'text-green-400' : 'text-red-400';
  const transformX = position.x > 0.72 ? 'calc(-100% - 10px)' : '10px';
  const transformY = position.y > 0.6 ? 'calc(-100% - 10px)' : '10px';
  const rows = [
    ['O', displayPrice(point.open, ticker)],
    ['H', displayPrice(point.high, ticker)],
    ['L', displayPrice(point.low, ticker)],
    ['C', displayPrice(point.close, ticker)],
    ['Prev', displayPrice(previousPoint?.close, ticker)],
    ['Vol', formatCompactNumber(point.volume)],
    ['Chg', displayPrice(change, ticker), changeClass],
  ];

  return (
    <div
      data-testid="candlestick-tooltip"
      className="pointer-events-none absolute z-20 w-[162px] border border-bloomberg-border bg-black/95 p-2 font-mono text-[10px] leading-4 shadow-lg"
      style={{
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: `translate(${transformX}, ${transformY})`,
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-bloomberg-orange tracking-wider">{point.date}</span>
        <span className={changeClass}>{formatChangePercent(point, previousPoint)}</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([label, value, valueClass]) => (
          <React.Fragment key={label}>
            <span className="text-bloomberg-muted">{label}</span>
            <span className={`text-right ${valueClass || 'text-white'}`}>{value}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

CandlestickTooltip.propTypes = {
  point: PropTypes.object.isRequired,
  previousPoint: PropTypes.object,
  ticker: PropTypes.string,
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
  }).isRequired,
};

export default function CandlestickPriceChart({
  points,
  allPoints = null,
  ticker = '',
  onZoom,
  rangeKey = '1Y',
  heightClass = 'h-[420px]',
  showVolume = true,
}) {
  const [hover, setHover] = useState(null);
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
    const maxVolume = Math.max(...normalizedPoints.map((point) => point.volume || 0), 1);
    const volumeTicks = [maxVolume, maxVolume / 2, 0];

    // Drop X ticks too close together to prevent date label overlap at full width.
    const stepPx = (WIDTH - PADDING.left - PADDING.right) / normalizedPoints.length;
    const rawXTicks = buildXAxisTicks(normalizedPoints);
    const xTicks = rawXTicks.filter((tick, i, arr) => {
      if (i === 0 || i === arr.length - 1) return true;
      const prev = arr[i - 1];
      return (tick.index - prev.index) * stepPx >= 68;
    });

    return {
      points: normalizedPoints,
      minPrice,
      maxPrice,
      maxVolume,
      xTicks,
      yTicks,
      volumeTicks,
    };
  }, [points]);

  const previousByDate = useMemo(() => {
    const normalizedAllPoints = normalizePricePoints(allPoints || points);
    const map = new Map();
    normalizedAllPoints.forEach((point, index) => {
      map.set(point.date, normalizedAllPoints[index - 1] || null);
    });
    return map;
  }, [allPoints, points]);

  if (!chart) {
    return (
      <div
        className={`${heightClass} border border-bloomberg-border bg-black p-3 font-mono text-xs text-bloomberg-muted`}
      >
        Valid OHLCV price chart data is not available for this analysis.
      </div>
    );
  }

  const svgHeight = showVolume ? HEIGHT : PRICE_HEIGHT + PADDING.bottom;
  const plotBottom = showVolume ? VOLUME_TOP + VOLUME_HEIGHT : PRICE_HEIGHT;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const pricePlotHeight = PRICE_HEIGHT - PADDING.top;
  const volumePlotHeight = VOLUME_HEIGHT;
  const step = plotWidth / chart.points.length;
  const candleWidth = dynamicSeriesWidth(step, rangeKey);
  const barWidth = dynamicSeriesWidth(step, rangeKey, 'volume');
  const priceToY = (price) => {
    const ratio = (chart.maxPrice - price) / (chart.maxPrice - chart.minPrice || 1);
    return PADDING.top + ratio * pricePlotHeight;
  };
  const volumeToY = (volume) =>
    VOLUME_TOP + ((chart.maxVolume - volume) / chart.maxVolume) * volumePlotHeight;
  const indexToX = (index) => PADDING.left + step * index + step / 2;
  const lastPoint = chart.points[chart.points.length - 1];
  const lastCloseY = priceToY(lastPoint.close);
  const nearTick = chart.yTicks.some((tick) => Math.abs(priceToY(tick) - lastCloseY) < 14);
  const lastPriceLabelY = nearTick ? lastCloseY - 16 : lastCloseY - 6;
  const hoverIndex = hover?.index ?? null;
  const hoverPoint = hoverIndex === null ? null : chart.points[hoverIndex];

  const resolveHoverIndex = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const relativeY = ((event.clientY - rect.top) / rect.height) * svgHeight;

    if (
      relativeX < PADDING.left ||
      relativeX > WIDTH - PADDING.right ||
      relativeY < PADDING.top ||
      relativeY > svgHeight - PADDING.bottom
    ) {
      setHover(null);
      return;
    }

    const index = Math.round((relativeX - PADDING.left - step / 2) / step);
    if (index >= 0 && index < chart.points.length) {
      setHover({
        index,
        x: Math.min(0.98, Math.max(0.02, relativeX / WIDTH)),
        y: Math.min(0.96, Math.max(0.04, relativeY / svgHeight)),
      });
      return;
    }

    setHover(null);
  };

  const handleWheel = (event) => {
    if (!onZoom) return;
    event.preventDefault();
    onZoom(event.deltaY > 0 ? 'out' : 'in');
  };

  return (
    <div className={`relative ${heightClass} overflow-hidden border border-bloomberg-border bg-black`}>
      <div className="relative h-full w-full">
        {hoverPoint && hover && (
          <CandlestickTooltip
            point={hoverPoint}
            previousPoint={previousByDate.get(hoverPoint.date) || null}
            ticker={ticker}
            position={hover}
          />
        )}
        <svg
          role="img"
          aria-label="OHLC candlestick price chart with integrated volume"
          className="h-full w-full"
          viewBox={`0 0 ${WIDTH} ${svgHeight}`}
          preserveAspectRatio="none"
          onMouseMove={resolveHoverIndex}
          onMouseLeave={() => setHover(null)}
          onWheel={handleWheel}
        >
          <rect x="0" y="0" width={WIDTH} height={svgHeight} fill="black" />

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
                  x={PADDING.left - 8}
                  y={y + 4}
                  fill={TEXT_COLOR}
                  fontFamily="monospace"
                  fontSize="11"
                  textAnchor="end"
                >
                  {displayPrice(tick, ticker)}
                </text>
              </g>
            );
          })}

          <line
            x1={PADDING.left}
            x2={PADDING.left}
            y1={PADDING.top}
            y2={plotBottom}
            stroke={AXIS_COLOR}
          />
          <text
            x={PADDING.left - 12}
            y={PADDING.top - 8}
            fill={TEXT_COLOR}
            fontFamily="monospace"
            fontSize="10"
            textAnchor="end"
          >
            PRICE
          </text>
          {showVolume && (
            <>
              <text
                x={PADDING.left + 8}
                y={VOLUME_TOP - 18}
                fill={TEXT_COLOR}
                fontFamily="monospace"
                fontSize="10"
                textAnchor="start"
              >
                VOLUME
              </text>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={VOLUME_TOP - 12}
                y2={VOLUME_TOP - 12}
                stroke={AXIS_COLOR}
              />
            </>
          )}

          {chart.points.map((point, index) => {
            const previousPoint = previousByDate.get(point.date) || null;
            const x = indexToX(index);
            const openY = priceToY(point.open);
            const closeY = priceToY(point.close);
            const rawBodyHeight = Math.abs(closeY - openY);
            const bodyHeight = Math.max(rawBodyHeight, 2);
            const bodyY = Math.min(openY, closeY) - (bodyHeight - rawBodyHeight) / 2;
            const color = movementColor(point, previousPoint);
            const volume = point.volume || 0;
            const volumeY = volumeToY(volume);
            const volumeHeight = VOLUME_TOP + VOLUME_HEIGHT - volumeY;

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
                  <title>{`${point.date}: O ${point.open}, H ${point.high}, L ${point.low}, C ${point.close}, Prev ${previousPoint?.close ?? 'N/A'}, Adj ${point.adjusted_close ?? 'N/A'}, V ${point.volume ?? 'N/A'}`}</title>
                </rect>
                {showVolume && (
                  <rect
                    data-testid="volume-bar"
                    x={x - barWidth / 2}
                    y={volumeY}
                    width={barWidth}
                    height={Math.max(volumeHeight, 1)}
                    fill={color}
                    opacity="0.72"
                  >
                    <title>{`${point.date}: Volume ${formatCompactNumber(point.volume)}`}</title>
                  </rect>
                )}
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
            x={PADDING.left - 12}
            y={lastPriceLabelY}
            fill={LAST_PRICE_COLOR}
            fontFamily="monospace"
            fontSize="11"
            fontWeight="bold"
            textAnchor="end"
          >
            {displayPrice(lastPoint.close, ticker)}
          </text>

          {showVolume &&
            chart.volumeTicks.map((tick) => {
            const y = volumeToY(tick);
            return (
              <g key={`volume-${tick}`}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke={GRID_COLOR}
                  strokeDasharray="4 6"
                />
                <text
                  x={PADDING.left - 12}
                  y={y + 4}
                  fill={TEXT_COLOR}
                  fontFamily="monospace"
                  fontSize="10"
                  textAnchor="end"
                >
                  {formatCompactNumber(tick)}
                </text>
              </g>
            );
          })}

          {hoverPoint && (
            <g>
              <line
                x1={indexToX(hoverIndex)}
                x2={indexToX(hoverIndex)}
                y1={PADDING.top}
                y2={plotBottom}
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
              y={svgHeight - 6}
              fill={TEXT_COLOR}
              fontFamily="monospace"
              fontSize="11"
              textAnchor="middle"
            >
              {label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

CandlestickPriceChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  allPoints: PropTypes.arrayOf(PropTypes.object),
  ticker: PropTypes.string,
  onZoom: PropTypes.func,
  rangeKey: PropTypes.string,
  heightClass: PropTypes.string,
  showVolume: PropTypes.bool,
};
