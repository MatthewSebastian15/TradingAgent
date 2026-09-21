import PropTypes from 'prop-types';

import NoticeBox from '../../../NoticeBox';
import PriceMetricLineChart from '../../PriceMetricLineChart';
import { finite, DASH } from '../format';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { Heatmap } from '../viz/Heatmap';
import { ScatterChart } from '../viz/ScatterChart';

const pct = (w) => (finite(w) ? `${(w * 100).toFixed(1)}%` : DASH);

function WeightsTable({ symbols, gmvWeights, tangencyWeights }) {
  const columns = [
    { key: 'symbol', label: 'Symbol' },
    { key: 'gmv', label: 'Min-Variance', align: 'right' },
    ...(tangencyWeights ? [{ key: 'tan', label: 'Max-Sharpe', align: 'right' }] : []),
  ];
  const rows = symbols.map((symbol, i) => ({
    symbol,
    gmv: pct(gmvWeights?.[i]),
    tan: pct(tangencyWeights?.[i]),
  }));
  return (
    <DataTable caption="Portfolio weights" columns={columns} rows={rows} rowKey={(r) => r.symbol} />
  );
}

WeightsTable.propTypes = {
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  gmvWeights: PropTypes.arrayOf(PropTypes.number),
  tangencyWeights: PropTypes.arrayOf(PropTypes.number),
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
  optimizerStatus,
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
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
              className="rounded-none border border-bloomberg-border px-2 py-0.5 font-mono text-[11px] text-bloomberg-muted hover:text-bloomberg-red"
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
          <Heatmap
            caption="Correlation matrix · daily returns on common days"
            rowLabels={symbols}
            colLabels={symbols}
            values={matrix}
            formatValue={(v) => (finite(v) ? v.toFixed(2) : DASH)}
          />

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
          {optimizerStatus === 'singular' && (
            <NoticeBox title="Optimizer">
              Covariance is singular for this basket — try different or fewer peers.
            </NoticeBox>
          )}
          {optimizerStatus === 'no_tangency' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
              <NoticeBox title="No max-Sharpe portfolio">
                The minimum-variance mix has no positive expected excess return over the risk-free
                rate, so a max-Sharpe portfolio does not exist for this basket. Showing
                minimum-variance weights only.
              </NoticeBox>
              <WeightsTable symbols={symbols} gmvWeights={gmvW} tangencyWeights={null} />
            </div>
          )}
          {optimizerStatus === 'ok' && frontier.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
              <ScatterChart
                title="Efficient frontier"
                subtitle="Annualized return vs volatility (unconstrained)"
                ariaLabel="Efficient frontier"
                xLabel="Volatility, ann. %"
                yLabel="Return, ann. %"
                formatX={(v) => `${v.toFixed(0)}%`}
                formatY={(v) => `${v.toFixed(0)}%`}
                lines={[
                  {
                    id: 'frontier',
                    label: 'Frontier',
                    color: CHART_COLORS.primary,
                    points: frontier.map((p) => ({ x: p.vol, y: p.ret })),
                  },
                ]}
                points={[
                  gmv && {
                    x: gmv.vol,
                    y: gmv.ret,
                    label: 'Min-Variance',
                    color: CHART_COLORS.tertiary,
                  },
                  tangency && {
                    x: tangency.vol,
                    y: tangency.ret,
                    label: 'Max-Sharpe',
                    color: CHART_COLORS.quaternary,
                  },
                ].filter(Boolean)}
              />
              <WeightsTable symbols={symbols} gmvWeights={gmvW} tangencyWeights={tanW} />
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
  optimizerStatus: PropTypes.oneOf(['ok', 'singular', 'no_tangency']).isRequired,
};
