import PropTypes from 'prop-types';

import NoticeBox from '../../../NoticeBox';
import { LAST_PRICE_COLOR } from '../../priceChartUtils';
import PriceMetricLineChart from '../../PriceMetricLineChart';
import { finite, DASH } from '../format';

export function CorrHeatmap({ symbols, matrix }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse font-mono text-[10px]">
        <thead>
          <tr>
            <th className="p-1" />
            {symbols.map((s) => (
              <th key={s} className="p-1 text-bloomberg-muted uppercase">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((rowSym, i) => (
            <tr key={rowSym}>
              <td className="p-1 text-right text-bloomberg-muted uppercase">{rowSym}</td>
              {symbols.map((colSym, j) => {
                const c = matrix[i][j];
                const bg = !finite(c)
                  ? 'transparent'
                  : c >= 0
                    ? `rgba(34,197,94,${Math.abs(c).toFixed(2)})`
                    : `rgba(239,68,68,${Math.abs(c).toFixed(2)})`;
                return (
                  <td
                    key={colSym}
                    className="border border-bloomberg-border px-2 py-1 text-center text-white"
                    style={{ backgroundColor: bg }}
                  >
                    {finite(c) ? c.toFixed(2) : DASH}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

CorrHeatmap.propTypes = {
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  matrix: PropTypes.arrayOf(PropTypes.array).isRequired,
};

// Efficient-frontier scatter with GMV + tangency portfolios marked.
export function FrontierChart({ frontier, gmv, tangency }) {
  const W = 720;
  const H = 260;
  const P = { t: 16, r: 16, b: 28, l: 40 };
  const pts = [...frontier, gmv, tangency].filter(Boolean);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.vol);
  const ys = pts.map((p) => p.ret);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const x = (v) => P.l + ((v - minX) / (maxX - minX || 1)) * (W - P.l - P.r);
  const y = (v) => P.t + ((maxY - v) / (maxY - minY || 1)) * (H - P.t - P.b);
  const path = frontier
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.vol).toFixed(1)} ${y(p.ret).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      role="img"
      aria-label="Efficient frontier: annualized return vs volatility"
      className="h-[260px] w-full border border-bloomberg-border bg-black"
      viewBox={`0 0 ${W} ${H}`}
    >
      <path d={path} fill="none" stroke={LAST_PRICE_COLOR} strokeWidth="1.5" />
      {gmv && <circle cx={x(gmv.vol)} cy={y(gmv.ret)} r="4" fill="#3b82f6" />}
      {tangency && <circle cx={x(tangency.vol)} cy={y(tangency.ret)} r="4" fill="#22c55e" />}
      <text x={P.l} y={H - 8} className="fill-bloomberg-muted text-[9px]">
        vol % →
      </text>
      <text x={4} y={P.t} className="fill-bloomberg-muted text-[9px]">
        ret %
      </text>
    </svg>
  );
}

FrontierChart.propTypes = {
  frontier: PropTypes.arrayOf(PropTypes.object).isRequired,
  gmv: PropTypes.object,
  tangency: PropTypes.object,
};

export function WeightsTable({ title, symbols, weights, color }) {
  if (!weights) return null;
  return (
    <div className="border border-bloomberg-border bg-bloomberg-card p-3">
      <div
        className="mb-1 flex items-center gap-2 text-[11px] tracking-wider uppercase"
        style={{ color }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </div>
      <table className="w-full font-mono text-[11px]">
        <tbody>
          {symbols.map((s, i) => (
            <tr key={s}>
              <td className="py-0.5 text-bloomberg-muted uppercase">{s}</td>
              <td className="py-0.5 text-right text-white">{(weights[i] * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

WeightsTable.propTypes = {
  title: PropTypes.string.isRequired,
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  weights: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.string.isRequired,
};

export function CorrelationSection({
  peerInput,
  onPeerInputChange,
  onAddPeers,
  peers,
  onRemovePeer,
  loading,
  symbols,
  matrix,
  rollPoints,
  rollLabel,
  frontier,
  gmv,
  tangency,
  gmvWeights: gmvW,
  tangencyWeights: tanW,
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        Add peer tickers to see how this name co-moves with them, and a quick mean-variance
        optimization over the basket. Each peer is one extra price fetch (2Y daily). Weights are
        unconstrained — they can go short (negative).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={peerInput}
          onChange={(e) => onPeerInputChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && onAddPeers()}
          placeholder="Add peers e.g. MSFT, NVDA"
          className="h-8 w-56 border border-bloomberg-border bg-black px-2 font-mono text-xs tracking-wider text-white placeholder:text-bloomberg-muted"
        />
        <button
          type="button"
          onClick={onAddPeers}
          className="h-8 rounded-none border border-bloomberg-border px-3 font-mono text-[11px] tracking-wider text-bloomberg-muted hover:text-white"
        >
          Add
        </button>
        {loading && <span className="font-mono text-[11px] text-bloomberg-amber">FETCHING…</span>}
      </div>

      {peers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {peers.map((p) => (
            <button
              key={p.symbol}
              type="button"
              onClick={() => onRemovePeer(p.symbol)}
              className="rounded-full border border-bloomberg-border px-2 py-0.5 font-mono text-[11px] text-bloomberg-muted hover:text-bloomberg-red"
            >
              {p.symbol} ✕
            </button>
          ))}
        </div>
      )}

      {symbols.length < 2 ? (
        <NoticeBox title="Correlation">
          Add at least one peer ticker to compute correlations.
        </NoticeBox>
      ) : (
        <>
          <div className="space-y-1">
            <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
              Correlation matrix (daily returns, common days)
            </div>
            <CorrHeatmap symbols={symbols} matrix={matrix} />
          </div>

          <PriceMetricLineChart
            title={`Rolling correlation (63-day) — ${rollLabel}`}
            subtitle="How the pair's co-movement drifts over time"
            points={rollPoints}
            valueType="number"
            emptyMessage="Not enough overlapping history for a rolling-correlation chart."
          />

          <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
            Mean-variance optimizer
          </div>
          {frontier.length === 0 ? (
            <NoticeBox title="Optimizer">
              Covariance is singular for this basket — try different or fewer peers.
            </NoticeBox>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
              <FrontierChart frontier={frontier} gmv={gmv} tangency={tangency} />
              <div className="space-y-3">
                <WeightsTable
                  title="Min-Variance"
                  symbols={symbols}
                  weights={gmvW}
                  color="#3b82f6"
                />
                <WeightsTable title="Max-Sharpe" symbols={symbols} weights={tanW} color="#22c55e" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

CorrelationSection.propTypes = {
  peerInput: PropTypes.string.isRequired,
  onPeerInputChange: PropTypes.func.isRequired,
  onAddPeers: PropTypes.func.isRequired,
  peers: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRemovePeer: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  matrix: PropTypes.arrayOf(PropTypes.array).isRequired,
  rollPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
  rollLabel: PropTypes.string.isRequired,
  frontier: PropTypes.arrayOf(PropTypes.object).isRequired,
  gmv: PropTypes.object,
  tangency: PropTypes.object,
  gmvWeights: PropTypes.arrayOf(PropTypes.number),
  tangencyWeights: PropTypes.arrayOf(PropTypes.number),
};

// Tab panel wrapper. Inactive panels stay mounted but hidden (native `hidden`
