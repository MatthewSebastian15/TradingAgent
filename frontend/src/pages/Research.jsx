import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';

import Navbar from '../components/Navbar';
import CandlestickPriceChart from '../components/results/tabs/CandlestickPriceChart';
import TickerSearchBar from '../components/TickerSearchBar';
import { useStockOverview } from '../hooks/useStockOverview';
import { buildApiUrl, buildAuthHeaders } from '../utils/api';

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

function signClass(n) {
  if (!Number.isFinite(n)) return 'text-bloomberg-muted';
  return n >= 0 ? 'text-bloomberg-green' : 'text-bloomberg-red';
}

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

// ── Primitives ────────────────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <div className="border border-bloomberg-border bg-bloomberg-card rounded-sm overflow-hidden">
      {title && (
        <div className="border-b border-bloomberg-border px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-bloomberg-orange">
            {title}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
SectionCard.propTypes = {
  title: PropTypes.string,
  children: PropTypes.node,
};

function DataRow({ label, value, valueClass }) {
  return (
    <div className="flex justify-between items-center px-3 py-[5px] border-b border-bloomberg-border last:border-0">
      <span className="font-mono text-[10px] text-bloomberg-muted">{label}</span>
      <span className={`font-mono text-xs ${valueClass}`}>{value}</span>
    </div>
  );
}
DataRow.propTypes = {
  label: PropTypes.string,
  value: PropTypes.node,
  valueClass: PropTypes.string,
};
DataRow.defaultProps = { valueClass: 'text-bloomberg-white' };

function SkeletonRow() {
  return (
    <div className="flex justify-between items-center px-3 py-[5px] border-b border-bloomberg-border last:border-0">
      <div className="animate-pulse bg-bloomberg-border rounded h-3 w-20" />
      <div className="animate-pulse bg-bloomberg-border rounded h-3 w-16" />
    </div>
  );
}

function MarginBar({ pct }) {
  return (
    <div className="h-[2px] bg-bloomberg-border rounded-full mt-1">
      <div
        className={`h-full rounded-full ${pct >= 0 ? 'bg-bloomberg-green' : 'bg-bloomberg-red'}`}
        style={{ width: `${Math.min(100, Math.abs(pct))}%` }}
      />
    </div>
  );
}
MarginBar.propTypes = { pct: PropTypes.number };

function RangeDot({ pct }) {
  return (
    <div className="relative h-[3px] bg-bloomberg-border rounded-full">
      <div
        className="absolute top-1/2 w-2.5 h-2.5 bg-bloomberg-orange rounded-full"
        style={{ left: `${pct}%`, transform: 'translateX(-50%) translateY(-50%)' }}
      />
    </div>
  );
}
RangeDot.propTypes = { pct: PropTypes.number };

// ── Section cards ─────────────────────────────────────────────────────────────

function StockHeader({ data, loading }) {
  const price = data?.price;
  const prevClose = data?.prev_close;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePct =
    change != null && prevClose && prevClose !== 0 ? (change / prevClose) * 100 : null;

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card rounded-sm">
      <div className="px-4 py-3 border-b border-bloomberg-border">
        {loading && !data ? (
          <div className="flex gap-4 items-center">
            <div className="animate-pulse bg-bloomberg-border rounded h-5 w-48" />
            <div className="animate-pulse bg-bloomberg-border rounded h-7 w-28" />
          </div>
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
          </>
        )}
      </div>
      <div className="flex px-4 gap-6">
        {['OVERVIEW', 'FINANCIALS', 'TECHNICALS', 'NEWS'].map((tab) => (
          <button
            key={tab}
            type="button"
            disabled={tab !== 'OVERVIEW'}
            className={`py-2 font-mono text-[11px] border-b-2 transition-colors ${
              tab === 'OVERVIEW'
                ? 'border-bloomberg-orange text-bloomberg-orange'
                : 'border-transparent text-bloomberg-muted opacity-40 cursor-not-allowed'
            }`}
          >
            {tab === 'OVERVIEW' ? `${tab} ●` : tab}
          </button>
        ))}
      </div>
    </div>
  );
}
StockHeader.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function StockDescription({ data }) {
  const [expanded, setExpanded] = useState(false);
  if (!data?.description) return null;
  return (
    <div className="px-4 py-3 border border-bloomberg-border bg-bloomberg-card rounded-sm">
      <p
        className={`font-mono text-[11px] text-bloomberg-muted leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}
      >
        {data.description}
      </p>
      {data.description.length > 200 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="font-mono text-[10px] text-bloomberg-orange mt-1"
        >
          {expanded ? 'Show less' : 'Show more...'}
        </button>
      )}
    </div>
  );
}
StockDescription.propTypes = { data: PropTypes.object };

function PriceChartCard({ ticker, ohlcvData, ohlcvLoading, activeRange, setActiveRange }) {
  const points = ohlcvData?.points || [];
  return (
    <SectionCard title="PRICE CHART">
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
      {ohlcvLoading ? (
        <div className="h-[350px] flex items-center justify-center">
          <div className="animate-pulse bg-bloomberg-border rounded h-4 w-32" />
        </div>
      ) : points.length >= 2 ? (
        <CandlestickPriceChart
          points={points}
          allPoints={points}
          ticker={ticker}
          rangeKey={activeRange}
          onZoom={() => {}}
        />
      ) : (
        <div className="h-[350px] flex items-center justify-center font-mono text-[10px] text-bloomberg-muted">
          NO CHART DATA
        </div>
      )}
    </SectionCard>
  );
}
PriceChartCard.propTypes = {
  ticker: PropTypes.string,
  ohlcvData: PropTypes.object,
  ohlcvLoading: PropTypes.bool,
  activeRange: PropTypes.string,
  setActiveRange: PropTypes.func,
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
    <SectionCard title="52W RANGE">
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
  return (
    <SectionCard title="TRADING DATA">
      {loading || !data
        ? Array.from({ length: 9 }).map((_, i) => <SkeletonRow key={i} />)
        : [
            ['OPEN', fmtNum(data.open)],
            ['HIGH', fmtNum(data.day_high)],
            ['LOW', fmtNum(data.day_low)],
            ['PREV CLOSE', fmtNum(data.prev_close)],
            ['BID', fmtNum(data.bid)],
            ['ASK', fmtNum(data.ask)],
            ['VOLUME', fmtLarge(data.volume)],
            ['AVG VOL', fmtLarge(data.avg_volume)],
            ['AVG VOL 10D', fmtLarge(data.avg_volume_10d)],
          ].map(([label, value]) => <DataRow key={label} label={label} value={value} />)}
    </SectionCard>
  );
}
TradingDataCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function QuickStatsCard({ data, loading }) {
  return (
    <SectionCard title="QUICK STATS">
      {loading || !data
        ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
        : [
            ['SHARES OUT', fmtLarge(data.shares_outstanding), ''],
            ['BETA', fmtNum(data.beta), negClass(data.beta)],
            ['SHORT RATIO', fmtNum(data.short_ratio), ''],
          ].map(([label, value, cls]) => (
            <DataRow key={label} label={label} value={value} valueClass={cls || 'text-bloomberg-white'} />
          ))}
    </SectionCard>
  );
}
QuickStatsCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function ValuationCard({ data, loading }) {
  return (
    <SectionCard title="VALUATION MULTIPLES">
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
            <DataRow key={label} label={label} value={value} valueClass={cls || 'text-bloomberg-white'} />
          ))}
    </SectionCard>
  );
}
ValuationCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

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
    <SectionCard title="ANALYST CONSENSUS">
      {loading || !data ? (
        Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
      ) : (
        <>
          <div className="px-3 py-4 border-b border-bloomberg-border text-center">
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
        </>
      )}
    </SectionCard>
  );
}
AnalystConsensusCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function DividendsCard({ data, loading }) {
  const yield_ = data?.dividend_yield;
  return (
    <SectionCard title="DIVIDENDS & YIELD">
      {loading || !data ? (
        Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
      ) : (
        <>
          <div className="px-3 py-4 border-b border-bloomberg-border text-center">
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
    <SectionCard title="PROFITABILITY">
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
    <SectionCard title="GROWTH & INCOME">
      {loading || !data ? (
        Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
      ) : (
        <>
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
          <DataRow label="GROSS PROFITS" value={fmtLarge(data.gross_profits)} valueClass={negClass(data.gross_profits)} />
          <DataRow label="EBITDA" value={fmtLarge(data.ebitda)} valueClass={negClass(data.ebitda)} />
          <DataRow label="OPER CASHFLOW" value={fmtLarge(data.operating_cashflow)} valueClass={negClass(data.operating_cashflow)} />
          <DataRow label="FREE CASHFLOW" value={fmtLarge(data.free_cashflow)} valueClass={negClass(data.free_cashflow)} />
        </>
      )}
    </SectionCard>
  );
}
GrowthIncomeCard.propTypes = { data: PropTypes.object, loading: PropTypes.bool };

function BalanceSheetCard({ data, loading }) {
  return (
    <SectionCard title="BALANCE SHEET">
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
    <SectionCard title="SHARES & OWNERSHIP">
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
    <SectionCard title="RISK ASSESSMENT">
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Research() {
  const [activeTicker, setActiveTicker] = useState(null);
  const [activeRange, setActiveRange] = useState('1Y');
  const [ohlcvData, setOhlcvData] = useState(null);
  const [ohlcvLoading, setOhlcvLoading] = useState(false);

  const { data, loading, error } = useStockOverview(activeTicker);

  useEffect(() => {
    if (!activeTicker) return;
    const controller = new AbortController();
    setOhlcvLoading(true);
    setOhlcvData(null);

    const doFetch = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const params = new URLSearchParams({
        ticker: activeTicker,
        range: activeRange,
        trade_date: today,
      });
      const headers = await buildAuthHeaders();
      const r = await fetch(buildApiUrl(`/market/ohlcv?${params}`), {
        headers,
        credentials: 'include',
        signal: controller.signal,
      });
      const d = await r.json();
      setOhlcvData(d);
      setOhlcvLoading(false);
    };

    doFetch().catch((e) => {
      if (e.name !== 'AbortError') setOhlcvLoading(false);
    });

    return () => controller.abort();
  }, [activeTicker, activeRange]);

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-12">
      <Navbar />
      <main className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-bloomberg-orange">
            ■ RESEARCH
          </span>
          <div className="w-72">
            <TickerSearchBar
              value={activeTicker || ''}
              onSelect={(item) => setActiveTicker(item.symbol)}
              onClear={() => setActiveTicker(null)}
            />
          </div>
        </div>

        {!activeTicker && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-bloomberg-orange">
              ■ RESEARCH
            </div>
            <p className="font-mono text-xs text-bloomberg-muted">
              Enter a ticker to load stock overview
            </p>
          </div>
        )}

        {activeTicker && (
          <>
            <StockHeader data={data} loading={loading} />

            {error && (
              <div className="px-4 py-6 font-mono text-xs text-bloomberg-red">
                ■ FAILED TO LOAD: {error}
              </div>
            )}

            {data && <StockDescription data={data} />}

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-3">
                <PriceChartCard
                  ticker={activeTicker}
                  ohlcvData={ohlcvData}
                  ohlcvLoading={ohlcvLoading}
                  activeRange={activeRange}
                  setActiveRange={setActiveRange}
                />
                <Range52WCard data={data} loading={loading} />
              </div>
              <div className="space-y-3">
                <TradingDataCard data={data} loading={loading} />
                <QuickStatsCard data={data} loading={loading} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ValuationCard data={data} loading={loading} />
              <AnalystConsensusCard data={data} loading={loading} />
              <DividendsCard data={data} loading={loading} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ProfitabilityCard data={data} loading={loading} />
              <GrowthIncomeCard data={data} loading={loading} />
              <BalanceSheetCard data={data} loading={loading} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SharesOwnershipCard data={data} loading={loading} />
              <RiskAssessmentCard data={data} loading={loading} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
