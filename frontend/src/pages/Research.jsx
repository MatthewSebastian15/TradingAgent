import PropTypes from 'prop-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AnalystHistoryStrip from '../components/research/AnalystHistoryStrip';
import DividendHistoryList from '../components/research/DividendHistoryList';
import FinancialsTab from '../components/research/FinancialsTab';
import FreshnessBadge from '../components/research/FreshnessBadge';
import GrowthSparkline from '../components/research/GrowthSparkline';
import NewsTab from '../components/research/NewsTab';
import {
  DataRow,
  MarginBar,
  RangeDot,
  SectionCard,
  Skeleton,
  SkeletonRow,
} from '../components/research/primitives';
import ResearchActions from '../components/research/ResearchActions';
import ResearchCommandBar from '../components/research/ResearchCommandBar';
import ResearchSidebar from '../components/research/ResearchSidebar';
import TechnicalsTab from '../components/research/TechnicalsTab';
import CandlestickPriceChart from '../components/results/tabs/CandlestickPriceChart';
import {
  AXIS_COLOR,
  buildXAxisTicks,
  formatCompactNumber,
  GRID_COLOR,
  movementColor,
  normalizePricePoints,
  TEXT_COLOR,
} from '../components/results/tabs/priceChartUtils';
import TickerSearchBar from '../components/TickerSearchBar';
import { AI_AGENT_PATH, WATCHLIST_PATH } from '../constants/routes';
import { useQuoteLite } from '../hooks/useQuoteLite';
import { useStockOverview } from '../hooks/useStockOverview';
import { useWatchlistStore } from '../hooks/useWatchlistStore';
import { buildApiUrl, buildAuthHeaders } from '../utils/api';
import { signClass as baseSignClass } from '../utils/formatting';
import { saveRecentTicker } from '../utils/recentTickers';

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtLarge(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtPct(n, { sign = false, decimals = 2 } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'N/A';
  const pct = n * 100;
  const prefix = sign && pct > 0 ? '+' : '';
  return `${prefix}${pct.toFixed(decimals)}%`;
}

function fmtNum(n, decimals = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'N/A';
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

const signClass = (n) => baseSignClass(n, { neutral: 'text-bloomberg-muted' });

function negClass(n) {
  if (!Number.isFinite(n)) return 'text-bloomberg-white';
  return n < 0 ? 'text-bloomberg-red' : 'text-bloomberg-white';
}

function recommendationColor(rec) {
  if (!rec) return 'text-bloomberg-muted';
  const r = rec.toUpperCase();
  if (r.includes('STRONG BUY') || r.includes('STRONG_BUY')) return 'text-bloomberg-green';
  if (r.includes('BUY')) return 'text-bloomberg-green';
  if (r.includes('HOLD') || r.includes('NEUTRAL')) return 'text-yellow-400';
  if (r.includes('SELL')) return 'text-bloomberg-red';
  return 'text-bloomberg-muted';
}

// ── Section cards ─────────────────────────────────────────────────────────────

const DETAIL_TABS = ['OVERVIEW', 'FINANCIALS', 'TECHNICALS', 'NEWS'];

const LAZY_TABS = [
  { name: 'FINANCIALS', Tab: FinancialsTab },
  { name: 'TECHNICALS', Tab: TechnicalsTab },
  { name: 'NEWS', Tab: NewsTab },
];

function StockHeader({ data, loading, updatedAt = null, activeTab, onTabChange, actions = null }) {
  const [descExpanded, setDescExpanded] = useState(false);
  const price = data?.price;
  const prevClose = data?.prev_close;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct =
    change != null && prevClose && prevClose !== 0 ? (change / prevClose) * 100 : null;

  return (
    <div
      aria-busy={(loading && !data) || undefined}
      className="border border-bloomberg-border bg-bloomberg-card rounded-sm"
    >
      <div className="px-4 py-3 border-b border-bloomberg-border">
        {loading && !data ? (
          <>
            <div className="flex gap-4 items-center">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-7 w-28" />
            </div>
            <div data-skeleton-slot="description" className="mt-2 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex gap-2 shrink-0">
                {data?.sector && (
                  <span className="border border-bloomberg-border px-2 py-0.5 font-mono text-[9px] uppercase text-bloomberg-muted">
                    {data.sector}
                  </span>
                )}
                {data?.industry && (
                  <span className="border border-bloomberg-border px-2 py-0.5 font-mono text-[9px] uppercase text-bloomberg-muted">
                    {data.industry}
                  </span>
                )}
              </div>
              <span className="font-mono text-sm font-bold text-bloomberg-white">
                {data?.name || '—'}
              </span>
              <div className="flex items-baseline gap-2 ml-auto">
                <span className="font-mono text-xl font-bold text-bloomberg-white">
                  {price != null ? fmtNum(price) : '—'}
                </span>
                {change != null && (
                  <span className={`font-mono text-sm ${signClass(change)}`}>
                    {change >= 0 ? '+' : ''}
                    {change.toFixed(2)}
                    {changePct != null
                      ? ` (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`
                      : ''}
                  </span>
                )}
                <FreshnessBadge updatedAt={updatedAt} />
              </div>
              <div className="text-right ml-4">
                <div className="font-mono text-[10px] text-bloomberg-muted">MARKET CAP</div>
                <div className="font-mono text-sm font-bold text-bloomberg-white">
                  {fmtLarge(data?.market_cap)}
                </div>
              </div>
            </div>
            {data && (
              <div className="mt-0.5 font-mono text-[10px] text-bloomberg-muted">
                {[data.exchange, data.currency].filter(Boolean).join(' • ')}
              </div>
            )}
            {data?.description && (
              <div className="mt-2">
                <p
                  className={`font-mono text-[11px] text-bloomberg-muted leading-relaxed ${descExpanded ? '' : 'line-clamp-3'}`}
                >
                  {data.description}
                </p>
                {data.description.length > 200 && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded(!descExpanded)}
                    className="font-mono text-[10px] text-bloomberg-orange mt-1"
                  >
                    {descExpanded ? 'Show less' : 'Show more...'}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 px-4">
        <div className="flex gap-6">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-pressed={activeTab === tab}
              className={`py-2 font-mono text-[11px] border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloomberg-orange ${
                activeTab === tab
                  ? 'border-bloomberg-orange text-bloomberg-orange'
                  : 'border-transparent text-bloomberg-muted hover:text-bloomberg-white'
              }`}
            >
              {activeTab === tab ? `${tab} ●` : tab}
            </button>
          ))}
        </div>
        {actions}
      </div>
    </div>
  );
}
StockHeader.propTypes = {
  data: PropTypes.object,
  loading: PropTypes.bool,
  updatedAt: PropTypes.number,
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
  actions: PropTypes.node,
};

const VOL_WIDTH = 1000;
const VOL_HEIGHT = 150;
const VOL_PADDING = { top: 14, right: 28, bottom: 28, left: 116 };

function VolumeBarChart({ points, rangeKey }) {
  const normalized = useMemo(() => normalizePricePoints(points), [points]);
  if (normalized.length < 2) return null;

  const plotWidth = VOL_WIDTH - VOL_PADDING.left - VOL_PADDING.right;
  const plotHeight = VOL_HEIGHT - VOL_PADDING.top - VOL_PADDING.bottom;
  const step = plotWidth / normalized.length;
  const denseGap = rangeKey === '1W' ? 4 : rangeKey === '1M' ? 5 : null;
  const barWidth =
    denseGap !== null ? Math.max(1.5, step - denseGap) : Math.max(1.5, Math.min(18, step * 0.72));
  const maxVolume = Math.max(...normalized.map((p) => p.volume || 0), 1);
  const toY = (v) => VOL_PADDING.top + ((maxVolume - v) / maxVolume) * plotHeight;
  const toX = (i) => VOL_PADDING.left + step * i + step / 2;
  // Same 68px spacing rule as the price chart so date labels never overlap.
  const xTicks = buildXAxisTicks(normalized).filter((tick, i, arr) => {
    if (i === 0 || i === arr.length - 1) return true;
    return (tick.index - arr[i - 1].index) * step >= 68;
  });

  return (
    <div className="h-[150px] border border-bloomberg-border bg-black">
      <svg
        role="img"
        aria-label="Trading volume bar chart"
        className="h-full w-full"
        viewBox={`0 0 ${VOL_WIDTH} ${VOL_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <rect x="0" y="0" width={VOL_WIDTH} height={VOL_HEIGHT} fill="black" />
        {[maxVolume, maxVolume / 2, 0].map((tick) => (
          <g key={`vtick-${tick}`}>
            <line
              x1={VOL_PADDING.left}
              x2={VOL_WIDTH - VOL_PADDING.right}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke={GRID_COLOR}
              strokeDasharray="4 6"
            />
            <text
              x={VOL_PADDING.left - 12}
              y={toY(tick) + 4}
              fill={TEXT_COLOR}
              fontFamily="monospace"
              fontSize="10"
              textAnchor="end"
            >
              {formatCompactNumber(tick)}
            </text>
          </g>
        ))}
        <line
          x1={VOL_PADDING.left}
          x2={VOL_PADDING.left}
          y1={VOL_PADDING.top}
          y2={VOL_HEIGHT - VOL_PADDING.bottom}
          stroke={AXIS_COLOR}
        />
        {normalized.map((point, index) => {
          const volume = point.volume || 0;
          const y = toY(volume);
          return (
            <rect
              key={`${point.date}-${index}`}
              data-testid="research-volume-bar"
              x={toX(index) - barWidth / 2}
              y={y}
              width={barWidth}
              height={Math.max(VOL_HEIGHT - VOL_PADDING.bottom - y, 1)}
              fill={movementColor(point, normalized[index - 1] || null)}
              opacity="0.72"
            >
              <title>{`${point.date}: Volume ${formatCompactNumber(point.volume)}`}</title>
            </rect>
          );
        })}
        {xTicks.map(({ index, label }) => (
          <text
            key={`${index}-${label}`}
            x={toX(index)}
            y={VOL_HEIGHT - 8}
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
  );
}
VolumeBarChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object).isRequired,
  rangeKey: PropTypes.string,
};

function PriceChartCard({
  ticker,
  ohlcvData,
  ohlcvLoading,
  activeRange,
  setActiveRange,
  ma50,
  ma200,
}) {
  const points = useMemo(() => ohlcvData?.points || [], [ohlcvData]);
  // Last range that had a drawable chart; kept on screen (faded) while the next range loads.
  const [last, setLast] = useState({ points: [], range: activeRange });
  useEffect(() => {
    if (points.length >= 2) setLast({ points, range: activeRange });
  }, [points, activeRange]);
  const shown = ohlcvLoading ? last : { points, range: activeRange };
  const referenceLines = [
    { value: ma50, label: 'MA50', color: '#3b82f6', testId: 'research-ma50-line' },
    { value: ma200, label: 'MA200', color: '#06b6d4', testId: 'research-ma200-line' },
  ];
  return (
    <SectionCard title="PRICE CHART" className="h-full" busy={ohlcvLoading}>
      <div className="flex gap-2 px-3 py-2 border-b border-bloomberg-border">
        {['1W', '1M', '3M', '6M', '1Y'].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setActiveRange(r)}
            className={`font-mono text-[10px] px-2 py-0.5 ${
              activeRange === r
                ? 'text-bloomberg-orange border border-bloomberg-orange'
                : 'text-bloomberg-muted border border-transparent hover:text-bloomberg-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="relative">
        <div
          data-testid="price-chart-body"
          className={`transition-opacity duration-200 motion-reduce:transition-none ${
            ohlcvLoading ? 'opacity-40' : 'opacity-100'
          }`}
        >
          {shown.points.length >= 2 ? (
            <>
              <CandlestickPriceChart
                points={shown.points}
                allPoints={shown.points}
                ticker={ticker}
                rangeKey={shown.range}
                onZoom={() => {}}
                heightClass="h-[324px]"
                showVolume={false}
                referenceLines={referenceLines}
              />
              <div className="border-y border-bloomberg-border px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bloomberg-orange">
                  VOLUME
                </span>
              </div>
              <VolumeBarChart points={shown.points} rangeKey={shown.range} />
            </>
          ) : (
            <div className="h-[490px] flex items-center justify-center font-mono text-[10px] text-bloomberg-muted">
              {ohlcvLoading ? '' : 'NO CHART DATA'}
            </div>
          )}
        </div>
        {ohlcvLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Skeleton className="h-4 w-32" />
          </div>
        )}
      </div>
    </SectionCard>
  );
}
PriceChartCard.propTypes = {
  ticker: PropTypes.string,
  ohlcvData: PropTypes.object,
  ohlcvLoading: PropTypes.bool,
  activeRange: PropTypes.string,
  setActiveRange: PropTypes.func,
  ma50: PropTypes.number,
  ma200: PropTypes.number,
};

function Range52WCard({ data, loading }) {
  const low = data?.week_52_low;
  const high = data?.week_52_high;
  const price = data?.price;
  const ma50 = data?.ma_50d;
  const ma200 = data?.ma_200d;
  const posPct =
    Number.isFinite(low) && Number.isFinite(high) && Number.isFinite(price) && high > low
      ? Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100))
      : null;
  const vsMa50 = price && ma50 ? ((price - ma50) / ma50) * 100 : null;
  const vsMa200 = price && ma200 ? ((price - ma200) / ma200) * 100 : null;

  return (
    <SectionCard title="52W RANGE" busy={loading || !data}>
      {loading || !data ? (
        Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
      ) : (
        <>
          {posPct !== null && (
            <div className="px-3 py-2 border-b border-bloomberg-border">
              <div className="flex justify-between font-mono text-[9px] text-bloomberg-muted mb-2">
                <span>{fmtNum(low)}</span>
                <span>{fmtNum(high)}</span>
              </div>
              <RangeDot pct={posPct} />
            </div>
          )}
          <DataRow label="52W LOW" value={fmtNum(low)} />
          <DataRow label="52W HIGH" value={fmtNum(high)} />
          <DataRow label="50D AVG" value={fmtNum(ma50)} />
          <DataRow label="200D AVG" value={fmtNum(ma200)} />
          <DataRow
            label="VS 50D"
            value={vsMa50 !== null ? `${vsMa50 >= 0 ? '+' : ''}${vsMa50.toFixed(2)}%` : 'N/A'}
            valueClass={signClass(vsMa50)}
          />
          <DataRow
            label="VS 200D"
            value={vsMa200 !== null ? `${vsMa200 >= 0 ? '+' : ''}${vsMa200.toFixed(2)}%` : 'N/A'}
            valueClass={signClass(vsMa200)}
          />
        </>
      )}
    </SectionCard>
  );
}
Range52WCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function TradingDataCard({ data, loading }) {
  const change =
    data?.price != null && data?.prev_close != null
      ? parseFloat((data.price - data.prev_close).toFixed(2))
      : null;
  const changePct =
    data?.price != null && data?.prev_close != null && data.prev_close !== 0
      ? parseFloat((((data.price - data.prev_close) / data.prev_close) * 100).toFixed(2))
      : null;

  return (
    <SectionCard title="TRADING DATA" busy={loading || !data}>
      {loading || !data
        ? Array.from({ length: 9 }).map((_, i) => <SkeletonRow key={i} />)
        : [
            ['OPEN', fmtNum(data.open), ''],
            ['HIGH', fmtNum(data.day_high), ''],
            ['LOW', fmtNum(data.day_low), ''],
            ['PREV CLOSE', fmtNum(data.prev_close), ''],
            [
              'CHANGE',
              change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}` : 'N/A',
              signClass(change),
            ],
            [
              'CHANGE %',
              changePct != null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : 'N/A',
              signClass(changePct),
            ],
            ['VOLUME', fmtLarge(data.volume), ''],
            ['AVG VOL', fmtLarge(data.avg_volume), ''],
            ['AVG VOL 10D', fmtLarge(data.avg_volume_10d), ''],
          ].map(([label, value, cls]) => (
            <DataRow
              key={label}
              label={label}
              value={value}
              valueClass={cls || 'text-bloomberg-white'}
            />
          ))}
    </SectionCard>
  );
}
TradingDataCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function QuickStatsCard({ data, loading }) {
  return (
    <SectionCard title="QUICK STATS" busy={loading || !data}>
      {loading || !data
        ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
        : [
            ['SHARES OUT', fmtLarge(data.shares_outstanding), ''],
            ['BETA', fmtNum(data.beta), negClass(data.beta)],
            ['SHORT RATIO', fmtNum(data.short_ratio), ''],
          ].map(([label, value, cls]) => (
            <DataRow
              key={label}
              label={label}
              value={value}
              valueClass={cls || 'text-bloomberg-white'}
            />
          ))}
    </SectionCard>
  );
}
QuickStatsCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function ValuationCard({ data, loading }) {
  return (
    <SectionCard title="VALUATION MULTIPLES" busy={loading || !data}>
      {loading || !data
        ? Array.from({ length: 9 }).map((_, i) => <SkeletonRow key={i} />)
        : [
            ['P/E (TTM)', fmtNum(data.pe_ttm), ''],
            ['FORWARD P/E', fmtNum(data.forward_pe), ''],
            ['P/B', fmtNum(data.pb), ''],
            ['P/S (TTM)', fmtNum(data.ps_ttm), ''],
            ['EV/REVENUE', fmtNum(data.ev_revenue), ''],
            ['EV/EBITDA', fmtNum(data.ev_ebitda), ''],
            ['EPS (TTM)', fmtNum(data.eps_ttm), negClass(data.eps_ttm)],
            ['EPS (FWD)', fmtNum(data.eps_fwd), negClass(data.eps_fwd)],
            ['BOOK VALUE', fmtNum(data.book_value), ''],
          ].map(([label, value, cls]) => (
            <DataRow
              key={label}
              label={label}
              value={value}
              valueClass={cls || 'text-bloomberg-white'}
            />
          ))}
    </SectionCard>
  );
}
ValuationCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

// Same box as the centered headline stat (big number + caption) the loaded cards render.
function StatBlockSkeleton() {
  return (
    <div
      data-skeleton-slot="stat"
      className="px-3 py-4 border-b border-bloomberg-border text-center"
    >
      <Skeleton className="h-7 w-24 mx-auto" />
      <Skeleton className="h-3 w-20 mx-auto mt-1.5" />
    </div>
  );
}

function AnalystConsensusCard({ data, loading }) {
  const price = data?.price;
  const tLow = data?.target_low;
  const tHigh = data?.target_high;
  const upside = data?.upside_downside_pct;
  const targetPosPct =
    price != null && tLow != null && tHigh != null && tHigh > tLow
      ? Math.max(0, Math.min(100, ((price - tLow) / (tHigh - tLow)) * 100))
      : null;

  return (
    <SectionCard title="ANALYST CONSENSUS" busy={loading || !data}>
      {loading || !data ? (
        <>
          <StatBlockSkeleton />
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </>
      ) : (
        <>
          <div
            data-content-slot="stat"
            className="px-3 py-4 border-b border-bloomberg-border text-center"
          >
            <div
              className={`font-mono text-xl font-bold ${recommendationColor(data.recommendation)}`}
            >
              {data.recommendation || 'N/A'}
            </div>
            {data.analyst_count != null && (
              <div className="font-mono text-[10px] text-bloomberg-muted mt-1">
                {data.analyst_count} ANALYSTS
              </div>
            )}
          </div>
          <DataRow label="TARGET LOW" value={fmtNum(tLow)} />
          <DataRow label="TARGET MEAN" value={fmtNum(data.target_mean)} />
          <DataRow label="TARGET MEDIAN" value={fmtNum(data.target_median)} />
          <DataRow label="TARGET HIGH" value={fmtNum(tHigh)} />
          <DataRow
            label="UPSIDE/DOWNSIDE"
            value={
              upside != null ? `${upside >= 0 ? '+' : ''}${Number(upside).toFixed(2)}%` : 'N/A'
            }
            valueClass={signClass(upside)}
          />
          {targetPosPct !== null && (
            <div className="px-3 py-3">
              <div className="flex justify-between font-mono text-[9px] text-bloomberg-muted mb-2">
                <span>{fmtNum(tLow)}</span>
                <span>{fmtNum(tHigh)}</span>
              </div>
              <RangeDot pct={targetPosPct} />
            </div>
          )}
          <AnalystHistoryStrip ticker={data.ticker} />
        </>
      )}
    </SectionCard>
  );
}
AnalystConsensusCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function DividendsCard({ data, loading }) {
  const yield_ = data?.dividend_yield;
  return (
    <SectionCard title="DIVIDENDS & YIELD" busy={loading || !data}>
      {loading || !data ? (
        <>
          <StatBlockSkeleton />
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </>
      ) : (
        <>
          <div
            data-content-slot="stat"
            className="px-3 py-4 border-b border-bloomberg-border text-center"
          >
            <div
              className={`font-mono text-xl font-bold ${Number.isFinite(yield_) && yield_ > 0 ? 'text-bloomberg-green' : 'text-bloomberg-muted'}`}
            >
              {fmtPct(yield_)}
            </div>
            <div className="font-mono text-[10px] text-bloomberg-muted mt-1">DIVIDEND YIELD</div>
          </div>
          <DataRow label="DIV RATE" value={fmtNum(data.div_rate)} />
          <DataRow label="PAYOUT RATIO" value={fmtPct(data.payout_ratio)} />
          <DataRow label="EX-DIV DATE" value={data.ex_div_date || 'N/A'} />
          <DividendHistoryList ticker={data.ticker} />
        </>
      )}
    </SectionCard>
  );
}
DividendsCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function ProfitabilityCard({ data, loading }) {
  const metrics = [
    ['GROSS MARGIN', data?.gross_margin],
    ['OPERATING MARGIN', data?.operating_margin],
    ['EBITDA MARGIN', data?.ebitda_margin],
    ['NET MARGIN', data?.net_margin],
    ['ROA', data?.roa],
    ['ROE', data?.roe],
  ];
  return (
    <SectionCard title="PROFITABILITY" busy={loading || !data}>
      {loading || !data
        ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        : metrics.map(([label, val]) => {
            const pct = Number.isFinite(val) ? val * 100 : null;
            return (
              <div
                key={label}
                className="px-3 py-[5px] border-b border-bloomberg-border last:border-0"
              >
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-bloomberg-muted">{label}</span>
                  <span className={`font-mono text-xs ${signClass(val)}`}>{fmtPct(val)}</span>
                </div>
                {pct !== null && <MarginBar pct={pct} />}
              </div>
            );
          })}
    </SectionCard>
  );
}
ProfitabilityCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function GrowthIncomeCard({ data, loading }) {
  return (
    <SectionCard title="GROWTH & INCOME" busy={loading || !data}>
      {loading || !data ? (
        Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
      ) : (
        <>
          <GrowthSparkline ticker={data.ticker} />
          <DataRow
            label="REVENUE GROWTH"
            value={fmtPct(data.revenue_growth, { sign: true })}
            valueClass={signClass(data.revenue_growth)}
          />
          <DataRow
            label="EARNINGS GROWTH"
            value={fmtPct(data.earnings_growth, { sign: true })}
            valueClass={signClass(data.earnings_growth)}
          />
          <DataRow
            label="QTR EARNINGS GR"
            value={fmtPct(data.quarterly_earnings_growth, { sign: true })}
            valueClass={signClass(data.quarterly_earnings_growth)}
          />
          <DataRow label="REVENUE" value={fmtLarge(data.revenue)} />
          <DataRow
            label="GROSS PROFITS"
            value={fmtLarge(data.gross_profits)}
            valueClass={negClass(data.gross_profits)}
          />
          <DataRow
            label="EBITDA"
            value={fmtLarge(data.ebitda)}
            valueClass={negClass(data.ebitda)}
          />
          <DataRow
            label="OPER CASHFLOW"
            value={fmtLarge(data.operating_cashflow)}
            valueClass={negClass(data.operating_cashflow)}
          />
          <DataRow
            label="FREE CASHFLOW"
            value={fmtLarge(data.free_cashflow)}
            valueClass={negClass(data.free_cashflow)}
          />
        </>
      )}
    </SectionCard>
  );
}
GrowthIncomeCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function BalanceSheetCard({ data, loading }) {
  return (
    <SectionCard title="BALANCE SHEET" busy={loading || !data}>
      {loading || !data
        ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        : [
            ['TOTAL CASH', fmtLarge(data.total_cash), ''],
            ['TOTAL DEBT', fmtLarge(data.total_debt), ''],
            ['NET CASH/DEBT', fmtLarge(data.net_cash_debt), signClass(data.net_cash_debt)],
            ['DEBT/EQUITY', fmtNum(data.debt_equity), negClass(data.debt_equity)],
            ['CURRENT RATIO', fmtNum(data.current_ratio), ''],
            ['QUICK RATIO', fmtNum(data.quick_ratio), ''],
          ].map(([label, value, cls]) => (
            <DataRow
              key={label}
              label={label}
              value={value}
              valueClass={cls || 'text-bloomberg-white'}
            />
          ))}
    </SectionCard>
  );
}
BalanceSheetCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function SharesOwnershipCard({ data, loading }) {
  const insider = Number.isFinite(data?.insider_pct) ? data.insider_pct * 100 : 0;
  const institution = Number.isFinite(data?.institution_pct) ? data.institution_pct * 100 : 0;
  const publicPct = Math.max(0, 100 - insider - institution);

  return (
    <SectionCard title="SHARES & OWNERSHIP" busy={loading || !data}>
      {loading || !data ? (
        Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
      ) : (
        <>
          <DataRow label="SHARES OUT" value={fmtLarge(data.shares_outstanding)} />
          <DataRow label="INSIDER %" value={fmtPct(data.insider_pct)} />
          <DataRow label="INSTITUTION %" value={fmtPct(data.institution_pct)} />
          <DataRow label="SHORT RATIO" value={fmtNum(data.short_ratio)} />
          <div className="px-3 py-3">
            <div className="flex h-2 rounded-full overflow-hidden">
              <div
                className="bg-bloomberg-orange"
                style={{ width: `${insider}%` }}
                title={`Insiders ${insider.toFixed(1)}%`}
              />
              <div
                className="bg-bloomberg-green"
                style={{ width: `${institution}%` }}
                title={`Institutions ${institution.toFixed(1)}%`}
              />
              <div
                className="bg-bloomberg-border"
                style={{ width: `${publicPct}%` }}
                title={`Public ${publicPct.toFixed(1)}%`}
              />
            </div>
            <div className="flex gap-3 mt-1.5 font-mono text-[9px] text-bloomberg-muted flex-wrap">
              <span>
                <span className="text-bloomberg-orange">■</span> INSIDERS {fmtPct(data.insider_pct)}
              </span>
              <span>
                <span className="text-bloomberg-green">■</span> INSTITUTIONS{' '}
                {fmtPct(data.institution_pct)}
              </span>
              <span>
                <span className="text-bloomberg-border">■</span> PUBLIC {`${publicPct.toFixed(2)}%`}
              </span>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}
SharesOwnershipCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function RiskAssessmentCard({ data, loading }) {
  return (
    <SectionCard title="RISK ASSESSMENT" busy={loading || !data}>
      {loading || !data
        ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
        : [
            ['BETA', fmtNum(data.beta), negClass(data.beta)],
            ['SHORT RATIO', fmtNum(data.short_ratio), ''],
            ['D/E RATIO', fmtNum(data.debt_equity), negClass(data.debt_equity)],
            [
              'RECOMMENDATION',
              data.recommendation || 'N/A',
              recommendationColor(data.recommendation),
            ],
            [
              'CONSENSUS SCORE',
              data.consensus_score != null ? `${fmtNum(data.consensus_score, 1)}/5` : 'N/A',
              '',
            ],
            ['PAYOUT RATIO', fmtPct(data.payout_ratio), ''],
          ].map(([label, value, cls]) => (
            <DataRow
              key={label}
              label={label}
              value={value}
              valueClass={cls || 'text-bloomberg-white'}
            />
          ))}
    </SectionCard>
  );
}
RiskAssessmentCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function LoadFailure({ message, onRetry }) {
  return (
    <div className="px-4 py-6 font-mono text-xs text-bloomberg-red flex items-center gap-3">
      <span>■ {message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="border border-bloomberg-red px-2 py-1 text-bloomberg-red hover:bg-bloomberg-red hover:text-black transition-colors"
      >
        RETRY
      </button>
    </div>
  );
}

LoadFailure.propTypes = {
  message: PropTypes.string.isRequired,
  onRetry: PropTypes.func.isRequired,
};

const COMPARE_CARDS = [
  ['valuation', ValuationCard],
  ['profitability', ProfitabilityCard],
  ['growth', GrowthIncomeCard],
  ['consensus', AnalystConsensusCard],
];

function CompareBar({ ticker, onPick }) {
  const pick = (symbol) => {
    const next = String(symbol || '')
      .trim()
      .toUpperCase();
    if (next) onPick(next);
  };
  return (
    <div className="flex items-center gap-3 border border-bloomberg-border bg-bloomberg-card px-3 py-1.5">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-bloomberg-orange">
        COMPARE WITH
      </span>
      <div className="flex-1 [&_input]:text-[12px] [&_input]:text-white">
        <TickerSearchBar
          bare
          value={ticker || ''}
          placeholder="Search a ticker to compare"
          onSelect={(item) => pick(item.symbol)}
          onSubmit={pick}
          onClear={() => {}}
        />
      </div>
    </div>
  );
}
CompareBar.propTypes = { ticker: PropTypes.string, onPick: PropTypes.func.isRequired };

// Side-by-side valuation / profitability / growth / consensus. Deliberately not the whole
// overview grid: the chart plus ten cards twice would be unreadable at normal widths.
function CompareSection({ primary, compare }) {
  return (
    <div data-testid="compare-section" className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="font-mono text-[11px] font-bold text-bloomberg-orange">
          {primary.ticker}
        </div>
        <div className="font-mono text-[11px] font-bold text-bloomberg-orange">
          {compare.ticker}
        </div>
      </div>
      {compare.error && (
        <LoadFailure message={`FAILED TO LOAD: ${compare.error}`} onRetry={compare.retry} />
      )}
      {COMPARE_CARDS.map(([key, Card]) => (
        <div key={key} className="grid grid-cols-2 gap-3">
          <Card data={primary.data} loading={primary.loading} />
          {!compare.error && <Card data={compare.data} loading={compare.loading} />}
        </div>
      ))}
    </div>
  );
}
CompareSection.propTypes = {
  primary: PropTypes.shape({
    ticker: PropTypes.string,
    data: PropTypes.object,
    loading: PropTypes.bool,
  }).isRequired,
  compare: PropTypes.shape({
    ticker: PropTypes.string,
    data: PropTypes.object,
    loading: PropTypes.bool,
    error: PropTypes.string,
    retry: PropTypes.func,
  }).isRequired,
};

// ── Page ──────────────────────────────────────────────────────────────────────

const RANGE_ORDER = ['1W', '1M', '3M', '6M', '1Y'];
const EXAMPLE_TICKERS = ['AAPL', 'MSFT', 'BBCA.JK', '^GSPC'];

export default function Research() {
  const [activeTicker, setActiveTicker] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const [activeRange, setActiveRange] = useState('1Y');
  const [activeTab, setActiveTab] = useState('OVERVIEW');
  const [visitedTabs, setVisitedTabs] = useState([]);
  if (!visitedTabs.includes(activeTab)) setVisitedTabs([...visitedTabs, activeTab]);
  const [ohlcvData, setOhlcvData] = useState(null);
  const [ohlcvLoading, setOhlcvLoading] = useState(false);

  const { data, loading, error, retry } = useStockOverview(activeTicker);
  const { quote, updatedAt } = useQuoteLite(activeTicker);
  const [comparing, setComparing] = useState(false);
  const [compareTicker, setCompareTicker] = useState(null);
  const compareOverview = useStockOverview(compareTicker);
  const navigate = useNavigate();
  const { activeGroup, hasTicker, addTicker } = useWatchlistStore();
  // Canonical symbol from the backend (e.g. BBCA -> BBCA.JK) so the watchlist and the AI
  // Agent form get the same symbol the quote/analysis endpoints expect.
  const researchSymbol = data?.ticker || activeTicker;
  const compareActive = comparing && Boolean(compareTicker) && activeTab === 'OVERVIEW';

  // Live price/volume over the slow, long-cached fundamentals snapshot. prev_close stays
  // from the snapshot (constant intraday) so the change is always computed consistently.
  const displayData = useMemo(() => {
    if (!data || !quote) return data;
    return { ...data, price: quote.price ?? data.price, volume: quote.volume ?? data.volume };
  }, [data, quote]);

  const handleAddToWatchlist = useCallback(() => {
    if (!researchSymbol) return;
    // A fresh profile has no group; never create one silently, let the user do it.
    if (!activeGroup) {
      navigate(WATCHLIST_PATH);
      return;
    }
    addTicker({ symbol: researchSymbol, name: data?.name, exchange: data?.exchange });
  }, [activeGroup, addTicker, data?.exchange, data?.name, navigate, researchSymbol]);

  const handleRunAnalysis = useCallback(() => {
    if (researchSymbol) navigate(AI_AGENT_PATH, { state: { prefillTicker: researchSymbol } });
  }, [navigate, researchSymbol]);

  const handleToggleCompare = useCallback(() => {
    setComparing((open) => !open);
    setCompareTicker(null);
  }, []);

  const handleSelect = useCallback((selection) => {
    const item = typeof selection === 'string' ? { symbol: selection } : selection || {};
    const sym = String(item.symbol || '').toUpperCase();
    if (!sym) return;
    // Keep exchange/name so the sidebar can show "TICKER-EXCHANGE".
    saveRecentTicker({ ...item, symbol: sym });
    setActiveTicker(sym);
    setVisitedTabs([]); // hidden tabs belong to the previous ticker
  }, []);

  // Phones get the rail only; the user can still expand it (it then overlays content).
  useEffect(() => {
    const mql = window.matchMedia?.('(max-width: 767px)');
    if (!mql) return undefined;
    const collapseOnMobile = () => {
      if (mql.matches) setCollapsed(true);
    };
    collapseOnMobile();
    mql.addEventListener('change', collapseOnMobile);
    return () => mql.removeEventListener('change', collapseOnMobile);
  }, []);

  // Auto-collapse sidebar once, the first time research content loads.
  useEffect(() => {
    if (activeTicker && !autoCollapsed) {
      setCollapsed(true);
      setAutoCollapsed(true);
    }
  }, [activeTicker, autoCollapsed]);

  const ohlcvCacheRef = useRef(new Map());

  const fetchOhlcvRange = useCallback(async (ticker, range, { signal } = {}) => {
    const cacheKey = `${ticker}:${range}`;
    if (ohlcvCacheRef.current.has(cacheKey)) return ohlcvCacheRef.current.get(cacheKey);
    const params = new URLSearchParams({
      ticker,
      range,
      trade_date: new Date().toISOString().slice(0, 10),
    });
    const headers = await buildAuthHeaders();
    const r = await fetch(buildApiUrl(`/market/ohlcv?${params}`), {
      headers,
      credentials: 'include',
      signal,
    });
    if (r.ok === false) throw new Error(`OHLCV request failed (${r.status})`);
    const d = await r.json();
    ohlcvCacheRef.current.set(cacheKey, d);
    return d;
  }, []);

  // New ticker: cached ranges belong to the old one.
  useEffect(() => {
    ohlcvCacheRef.current = new Map();
  }, [activeTicker]);

  useEffect(() => {
    if (!activeTicker) return;
    const controller = new AbortController();
    const cached = ohlcvCacheRef.current.get(`${activeTicker}:${activeRange}`);

    if (cached) {
      setOhlcvData(cached);
      setOhlcvLoading(false);
    } else {
      setOhlcvLoading(true);
      setOhlcvData(null);
      fetchOhlcvRange(activeTicker, activeRange, { signal: controller.signal })
        .then((d) => {
          if (controller.signal.aborted) return; // range/ticker changed while in flight
          setOhlcvData(d);
          setOhlcvLoading(false);
        })
        .catch((e) => {
          if (controller.signal.aborted || e.name === 'AbortError') return;
          setOhlcvLoading(false);
        });
    }

    // Warm the two neighbouring ranges; failures are dropped, a real fetch retries on demand.
    const idx = RANGE_ORDER.indexOf(activeRange);
    [RANGE_ORDER[idx - 1], RANGE_ORDER[idx + 1]].filter(Boolean).forEach((range) => {
      fetchOhlcvRange(activeTicker, range).catch(() => {});
    });

    return () => controller.abort();
  }, [activeTicker, activeRange, fetchOhlcvRange]);

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-10">
      <div className="px-4 pt-4">
        <ResearchCommandBar
          value={activeTicker || ''}
          onSelect={(item) => handleSelect(item)}
          onSubmit={({ symbol }) => handleSelect(symbol)}
          loading={loading}
        />
      </div>
      <div className="flex flex-row">
        <div className="sticky top-[60px] h-[calc(100vh-60px)] shrink-0 self-start">
          <ResearchSidebar
            activeTicker={activeTicker}
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            onSelect={handleSelect}
          />
        </div>
        <main className="flex-1 px-4 py-4 space-y-3">
          {!activeTicker && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-bloomberg-orange">
                ■ RESEARCH
              </div>
              <p className="font-mono text-xs text-bloomberg-muted">
                Enter a ticker above to load its overview, chart, and fundamentals.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_TICKERS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => handleSelect(example)}
                    className="border border-bloomberg-border px-3 py-1.5 font-mono text-[11px] text-bloomberg-white/80 transition-colors hover:border-bloomberg-orange hover:text-bloomberg-orange"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTicker && (
            <>
              <StockHeader
                data={displayData}
                loading={loading}
                updatedAt={updatedAt}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                actions={
                  <ResearchActions
                    inWatchlist={Boolean(researchSymbol) && hasTicker(researchSymbol)}
                    comparing={comparing}
                    onAddToWatchlist={handleAddToWatchlist}
                    onRunAnalysis={handleRunAnalysis}
                    onToggleCompare={handleToggleCompare}
                  />
                }
              />

              {error && <LoadFailure message={`FAILED TO LOAD: ${error}`} onRetry={retry} />}
              {!error && data?.data_quality === 'unavailable' && (
                <LoadFailure message="VENDOR DATA UNAVAILABLE — try again" onRetry={retry} />
              )}
              {data?.data_quality === 'partial' && (
                <div className="px-4 py-2 font-mono text-[10px] text-bloomberg-amber">
                  ■ Some fields unavailable — one or more data vendors did not respond.
                </div>
              )}

              {comparing && <CompareBar ticker={compareTicker} onPick={setCompareTicker} />}
              {compareActive && (
                <CompareSection
                  primary={{ ticker: activeTicker, data, loading }}
                  compare={{
                    ticker: compareTicker,
                    data: compareOverview.data,
                    loading: compareOverview.loading,
                    error: compareOverview.error,
                    retry: compareOverview.retry,
                  }}
                />
              )}

              {activeTab === 'OVERVIEW' && (
                <>
                  <div
                    data-testid="research-chart-row"
                    className="grid grid-cols-1 lg:grid-cols-3 gap-3"
                  >
                    <div data-testid="research-chart-col" className="col-span-1 lg:col-span-2">
                      <PriceChartCard
                        key={activeTicker}
                        ticker={activeTicker}
                        ohlcvData={ohlcvData}
                        ohlcvLoading={ohlcvLoading}
                        activeRange={activeRange}
                        setActiveRange={setActiveRange}
                        ma50={data?.ma_50d}
                        ma200={data?.ma_200d}
                      />
                    </div>
                    <div className="space-y-3">
                      <TradingDataCard data={displayData} loading={loading} />
                      <QuickStatsCard data={data} loading={loading} />
                      <Range52WCard data={data} loading={loading} />
                    </div>
                  </div>

                  {compareActive ? (
                    // Valuation/profitability/growth/consensus already sit in the compare
                    // section above; only the cards it does not repeat remain here.
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <DividendsCard data={data} loading={loading} />
                      <BalanceSheetCard data={data} loading={loading} />
                      <SharesOwnershipCard data={data} loading={loading} />
                      <RiskAssessmentCard data={data} loading={loading} />
                    </div>
                  ) : (
                    <>
                      <div
                        data-testid="research-overview-grid-1"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                      >
                        <ValuationCard data={data} loading={loading} />
                        <AnalystConsensusCard data={data} loading={loading} />
                        <DividendsCard data={data} loading={loading} />
                      </div>

                      <div
                        data-testid="research-overview-grid-2"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                      >
                        <ProfitabilityCard data={data} loading={loading} />
                        <GrowthIncomeCard data={data} loading={loading} />
                        <BalanceSheetCard data={data} loading={loading} />
                      </div>

                      <div
                        data-testid="research-side-by-side-grid"
                        className="grid grid-cols-1 md:grid-cols-2 gap-3"
                      >
                        <SharesOwnershipCard data={data} loading={loading} />
                        <RiskAssessmentCard data={data} loading={loading} />
                      </div>
                    </>
                  )}
                </>
              )}
              {/* Visited tabs stay mounted (hidden) so switching back keeps their state. */}
              {LAZY_TABS.filter((tab) => visitedTabs.includes(tab.name)).map(({ name, Tab }) => (
                <div key={name} hidden={activeTab !== name}>
                  <Tab ticker={activeTicker} />
                </div>
              ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
