import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { buildApiUrl, buildAuthHeaders, readHttpError } from '../../../utils/api';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';
import CandlestickPriceChart from './CandlestickPriceChart';
import PriceMetricLineChart from './PriceMetricLineChart';
import {
  buildHistoricalMarketCapPoints,
  buildMaxDrawdownPoints,
  DEFAULT_PRICE_RANGE,
  filterPricePointsByRange,
  PRICE_RANGE_OPTIONS,
  rangeNeedsDetailFetch,
  resolveYoyPriceWindow,
  toNumber,
} from './priceChartUtils';

function firstNumber(...values) {
  for (const value of values) {
    const number = toNumber(value);
    if (number !== null && number > 0) return number;
  }
  return null;
}

function resolveSharesOutstanding(result, chart, points) {
  const profile = result?.company_profile || {};
  const directShares = firstNumber(
    profile.shares_outstanding,
    profile.shares_out,
    profile.sharesOutstanding,
    profile.shares_ownership?.shares_out,
    profile.ownership?.shares_out
  );
  if (directShares) return directShares;

  const latestClose = firstNumber(
    result?.current_price,
    chart?.summary?.latest_close,
    chart?.stats?.end_price,
    points?.at(-1)?.close
  );
  const marketCap = firstNumber(
    profile.market_cap,
    result?.financial_highlights?.point_in_time?.find?.((item) => item?.key === 'market_cap')?.value
  );

  return marketCap && latestClose ? marketCap / latestClose : null;
}

const EMPTY_PRICE_CHART = {};
const ZOOM_RANGE_ORDER = ['1Y', '3M', '1M', '1W'];

function remoteCacheKey(ticker, rangeKey, tradeDate) {
  return `${ticker || ''}:${rangeKey}:${tradeDate || ''}`;
}

export default function ChartPriceTab({ result }) {
  const [activeRange, setActiveRange] = useState(DEFAULT_PRICE_RANGE);
  const [remoteRanges, setRemoteRanges] = useState({});
  const chart = result?.price_chart || EMPTY_PRICE_CHART;
  const yoyWindow = useMemo(() => resolveYoyPriceWindow(chart, chart.points), [chart]);
  const ticker = chart.ticker || result?.ticker;
  const tradeDateForFetch = chart.requested_trade_date || chart.trade_date || yoyWindow.endDate;
  const chartIdentity = `${ticker || ''}:${tradeDateForFetch || ''}:${yoyWindow.endDate || ''}`;
  const rangeDataKey = remoteCacheKey(ticker, activeRange, tradeDateForFetch);
  const remoteRange = remoteRanges[rangeDataKey];
  const localRangePoints = useMemo(
    () => filterPricePointsByRange(yoyWindow.points, activeRange),
    [activeRange, yoyWindow.points]
  );
  const remotePoints = useMemo(
    () =>
      remoteRange?.available === true &&
      Array.isArray(remoteRange.points) &&
      remoteRange.points.length >= 2
        ? remoteRange.points
        : [],
    [remoteRange]
  );
  const points = remotePoints.length >= 2 ? remotePoints : localRangePoints;
  const allPointsForActiveRange = remotePoints.length >= 2 ? remotePoints : yoyWindow.points;
  const activeSource = remotePoints.length >= 2 ? remoteRange?.source : chart.source;
  const chartCurrency = chart.currency || result?.company_profile?.currency || '';
  const sharesOutstanding = useMemo(
    () => resolveSharesOutstanding(result, chart, yoyWindow.points),
    [chart, result, yoyWindow.points]
  );
  const historicalMarketCapPoints = useMemo(
    () => buildHistoricalMarketCapPoints(yoyWindow.points, sharesOutstanding),
    [sharesOutstanding, yoyWindow.points]
  );
  const maxDrawdownPoints = useMemo(
    () => buildMaxDrawdownPoints(yoyWindow.points),
    [yoyWindow.points]
  );

  useEffect(() => {
    setActiveRange(DEFAULT_PRICE_RANGE);
    setRemoteRanges({});
  }, [chartIdentity]);

  useEffect(() => {
    if (!ticker || !tradeDateForFetch || !rangeNeedsDetailFetch(activeRange) || remoteRange) {
      return undefined;
    }

    const controller = new AbortController();
    async function loadRange() {
      try {
        const params = new URLSearchParams({
          ticker,
          range: activeRange,
          trade_date: tradeDateForFetch,
        });
        const response = await fetch(buildApiUrl(`/market/ohlcv?${params.toString()}`), {
          headers: await buildAuthHeaders(),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(await readHttpError(response));
        const payload = await response.json();
        if (!controller.signal.aborted) {
          setRemoteRanges((current) => ({ ...current, [rangeDataKey]: payload }));
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        setRemoteRanges((current) => ({
          ...current,
          [rangeDataKey]: { available: false, points: [], warning: error.message },
        }));
      }
    }

    loadRange();
    return () => controller.abort();
  }, [activeRange, rangeDataKey, remoteRange, ticker, tradeDateForFetch]);

  const zoomChart = (direction) => {
    setActiveRange((currentRange) => {
      if (currentRange === 'YTD') return direction === 'out' ? '1Y' : '1M';
      const index = ZOOM_RANGE_ORDER.indexOf(currentRange);
      if (index === -1) return DEFAULT_PRICE_RANGE;
      const nextIndex = direction === 'in' ? index + 1 : index - 1;
      return ZOOM_RANGE_ORDER[Math.min(ZOOM_RANGE_ORDER.length - 1, Math.max(0, nextIndex))];
    });
  };

  if (chart.available !== true || points.length < 2) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <NoticeBox title="CHART DATA UNAVAILABLE" tone="amber">
          {chart.warning || 'Valid OHLC price chart data is not available for this analysis.'}
        </NoticeBox>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border space-y-4">
      <section>
        <SectionHeader label="CHART & PRICE" />
      </section>

      {chart.warning && (
        <NoticeBox title="CHART DATA WARNING" tone="amber">
          {chart.warning}
        </NoticeBox>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
            CHART
            {activeSource && (
              <span className="ml-2 text-[10px] normal-case tracking-normal text-bloomberg-muted">
                Source: {activeSource}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex overflow-hidden rounded-sm border border-bloomberg-border bg-black"
              aria-label="Chart range selector"
            >
              {PRICE_RANGE_OPTIONS.map((option) => {
                const active = activeRange === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setActiveRange(option.key)}
                    className={`min-w-10 px-3 py-1.5 font-mono text-[11px] tracking-wider transition-all duration-150 ${
                      active
                        ? 'bg-bloomberg-orange text-black shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]'
                        : 'text-bloomberg-muted hover:bg-white/5 hover:text-bloomberg-white'
                    }`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="inline-flex overflow-hidden rounded-sm border border-bloomberg-border bg-black">
              <button
                type="button"
                onClick={() => zoomChart('in')}
                className="h-7 w-8 font-mono text-sm text-bloomberg-muted transition-colors hover:bg-white/5 hover:text-bloomberg-white disabled:opacity-35"
                disabled={activeRange === '1W'}
                aria-label="Zoom in chart"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => zoomChart('out')}
                className="h-7 w-8 border-l border-bloomberg-border font-mono text-sm text-bloomberg-muted transition-colors hover:bg-white/5 hover:text-bloomberg-white disabled:opacity-35"
                disabled={activeRange === '1Y'}
                aria-label="Zoom out chart"
              >
                −
              </button>
            </div>
          </div>
        </div>
        <CandlestickPriceChart
          points={points}
          allPoints={allPointsForActiveRange}
          ticker={ticker}
          onZoom={zoomChart}
          rangeKey={activeRange}
        />
      </section>

      <section>
        <SectionHeader label="MARKET CAP & DRAWDOWN" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <PriceMetricLineChart
            title="Historical Market Cap"
            subtitle="YOY window anchored to trade date"
            points={historicalMarketCapPoints}
            valueType="currency"
            currency={chartCurrency}
            emptyMessage="Shares outstanding or market cap is unavailable. Historical market cap cannot be calculated."
          />
          <PriceMetricLineChart
            title="Max Drawdown"
            subtitle="Rolling peak-to-trough drawdown across the YOY window"
            points={maxDrawdownPoints}
            valueType="percent"
            currency={chartCurrency}
            emptyMessage="Drawdown data is unavailable."
          />
        </div>
      </section>
    </div>
  );
}

ChartPriceTab.propTypes = {
  result: PropTypes.object.isRequired,
};
