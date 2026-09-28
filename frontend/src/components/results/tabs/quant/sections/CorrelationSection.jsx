import { X } from 'lucide-react';
import PropTypes from 'prop-types';

import TickerSearchBar from '../../../../TickerSearchBar';
import NoticeBox from '../../../NoticeBox';
import { AdvancedPanel } from '../AdvancedPanel';
import { NumberField } from '../charts';
import { DASH, finite, fmtPercent, fmtRatio } from '../format';
import { FIELD_GRID } from '../layout';
import { SegmentedControl } from '../SegmentedControl';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { Heatmap } from '../viz/Heatmap';
import { LineChart } from '../viz/LineChart';
import { ScatterChart } from '../viz/ScatterChart';

const PORTFOLIO_COLORS = {
  gmv: CHART_COLORS.tertiary,
  tangency: CHART_COLORS.quaternary,
  lo_minvar: '#60a5fa',
  lo_sharpe: CHART_COLORS.primary,
  riskparity: CHART_COLORS.warning,
  equal: CHART_COLORS.secondary,
};

const parseSymbols = (raw) =>
  String(raw || '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

export function CorrelationSection({
  onAddPeers,
  peers,
  onRemovePeer,
  loading,
  peerErrors,
  frequency,
  onFrequencyChange,
  shrink,
  onShrinkChange,
  cap,
  onCapChange,
  onPairChange,
  corr,
}) {
  const { symbols, portfolios } = corr;
  const unit = frequency === 'weekly' ? 'weekly' : 'daily';

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        Add peers to see co-movement and compare portfolio constructions. Unconstrained
        mean-variance can short and lever; long-only, capped and risk-parity mixes are far more
        stable. Research only.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-xs">
          <TickerSearchBar
            value=""
            onSelect={(item) => onAddPeers([String(item.symbol).toUpperCase()])}
            onClear={() => {}}
            onSubmit={(raw) => onAddPeers(parseSymbols(raw))}
            placeholder="Add peer ticker"
          />
        </div>
        {loading && <span className="font-mono text-[11px] text-bloomberg-amber">FETCHING…</span>}
        {peers.map((p) => (
          <button
            key={p.symbol}
            type="button"
            onClick={() => onRemovePeer(p.symbol)}
            aria-label={`Remove ${p.symbol}`}
            className="rounded-none border border-bloomberg-border px-2 py-0.5 font-mono text-[11px] text-bloomberg-white/80 hover:text-bloomberg-red"
          >
            <span className="inline-flex items-center gap-1">
              {p.symbol}
              <X className="h-3 w-3" aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
      {peerErrors.length > 0 && (
        <NoticeBox title="Some peers were not added">
          <ul>
            {peerErrors.map((e) => (
              <li key={e.symbol}>{`${e.symbol}: ${e.message}`}</li>
            ))}
          </ul>
        </NoticeBox>
      )}

      <div className={FIELD_GRID}>
        <SegmentedControl
          ariaLabel="Return frequency"
          options={[
            { id: 'daily', label: 'Daily' },
            { id: 'weekly', label: 'Weekly' },
          ]}
          value={frequency}
          onChange={onFrequencyChange}
        />
      </div>

      <AdvancedPanel>
        <div className={FIELD_GRID}>
          <SegmentedControl
            ariaLabel="Covariance estimator"
            options={[
              { id: false, label: 'Sample covariance' },
              { id: true, label: 'Ledoit-Wolf' },
            ]}
            value={shrink}
            onChange={onShrinkChange}
          />
          <NumberField label="Long-only weight cap" value={cap} onChange={onCapChange} suffix="%" />
        </div>
      </AdvancedPanel>

      {symbols.length < 2 ? (
        <NoticeBox title="Correlation">
          Add at least one peer ticker to compute correlations.
        </NoticeBox>
      ) : corr.tooShort ? (
        <NoticeBox title="Correlation">
          Not enough overlapping history ({corr.observations} {unit} points).
        </NoticeBox>
      ) : (
        <>
          <Heatmap
            caption={`Correlation · ${unit} returns · n=${corr.observations}`}
            rowLabels={symbols}
            colLabels={symbols}
            values={corr.matrix}
            formatValue={(v) => (finite(v) ? v.toFixed(2) : DASH)}
          />

          <div className="flex flex-wrap items-end gap-3">
            {[0, 1].map((slot) => (
              <label
                key={slot}
                className="flex flex-col gap-1 font-mono text-[11px] text-bloomberg-white/80"
              >
                <span className="tracking-wider uppercase">
                  {slot === 0 ? 'First symbol' : 'Second symbol'}
                </span>
                <select
                  value={corr.pair[slot]}
                  onChange={(e) => onPairChange(slot, e.target.value)}
                  className="h-8 rounded-none border border-bloomberg-border bg-black px-2 text-xs text-white"
                >
                  {symbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <LineChart
            title={`Rolling correlation · ${corr.pair[0]} vs ${corr.pair[1]}`}
            subtitle={`Window: ${frequency === 'weekly' ? '26 weeks' : '63 days'}`}
            ariaLabel="Rolling correlation"
            formatY={(v) => v.toFixed(1)}
            series={[
              {
                id: 'rc',
                label: 'Correlation',
                color: CHART_COLORS.primary,
                points: corr.rollPoints.map((p) => ({ x: p.date, y: p.value })),
              },
            ]}
            referenceLines={[{ y: 0, color: CHART_COLORS.axis }]}
            emptyMessage="Not enough overlapping history for a rolling correlation."
          />

          {corr.optimizerStatus === 'singular' && (
            <NoticeBox title="Unconstrained optimizer">
              Covariance is singular for this basket — switch on Ledoit-Wolf or remove
              near-duplicate peers.
            </NoticeBox>
          )}
          {corr.optimizerStatus === 'no_tangency' && (
            <NoticeBox title="No unconstrained max-Sharpe portfolio">
              Every fully invested unconstrained mix has a negative expected excess return, so a
              tangency portfolio does not exist. Long-only and risk-parity mixes below are still
              valid.
            </NoticeBox>
          )}
          {corr.optimizerStatus === 'lo_negative_excess' && (
            <NoticeBox title="No long-only max-Sharpe portfolio either">
              The long-only max-Sharpe portfolio has no basket with positive expected excess return
              either — the long-only mixes above may not be meaningful either.
            </NoticeBox>
          )}

          {(corr.optimizerStatus === 'ok' || corr.optimizerStatus === 'lo_negative_excess') &&
            corr.frontier.length > 0 && (
              <ScatterChart
                title="Efficient frontier"
                subtitle={`Annualized · efficient branch only${corr.shrinkage !== null ? ` · Ledoit-Wolf shrinkage δ = ${corr.shrinkage.toFixed(2)}` : ''}`}
                ariaLabel="Efficient frontier"
                xLabel="Volatility, ann. %"
                yLabel="Return, ann. %"
                formatX={(v) => `${v.toFixed(0)}%`}
                formatY={(v) => `${v.toFixed(0)}%`}
                lines={[
                  {
                    id: 'frontier',
                    label: 'Efficient frontier',
                    color: CHART_COLORS.primary,
                    points: corr.frontier.map((p) => ({ x: p.vol, y: p.ret })),
                  },
                  ...(corr.cml.length
                    ? [
                        {
                          id: 'cml',
                          label: 'Capital market line',
                          color: CHART_COLORS.secondary,
                          dashed: true,
                          points: corr.cml,
                        },
                      ]
                    : []),
                ]}
                points={[
                  ...corr.assets.map((a) => ({
                    x: a.vol,
                    y: a.ret,
                    label: a.label,
                    color: '#e5e5e5',
                    radius: 3,
                  })),
                  ...portfolios.map((p) => ({
                    x: p.vol,
                    y: p.ret,
                    label: p.label,
                    color: PORTFOLIO_COLORS[p.id] || CHART_COLORS.primary,
                  })),
                ]}
              />
            )}

          {portfolios.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <DataTable
                caption="Portfolio comparison"
                rowKey={(r) => r.id}
                rows={portfolios}
                columns={[
                  { key: 'label', label: 'Portfolio' },
                  { key: 'ret', label: 'Return', align: 'right', render: (r) => fmtPercent(r.ret) },
                  { key: 'vol', label: 'Vol', align: 'right', render: (r) => fmtPercent(r.vol) },
                  {
                    key: 'sharpe',
                    label: 'Sharpe',
                    align: 'right',
                    render: (r) => fmtRatio(r.sharpe),
                  },
                ]}
              />
              <DataTable
                caption="Weights"
                stickyFirstColumn
                rowKey={(r) => r.symbol}
                rows={symbols.map((symbol, i) => ({ symbol, i }))}
                columns={[
                  { key: 'symbol', label: 'Symbol' },
                  ...portfolios.map((p) => ({
                    key: p.id,
                    label: p.label,
                    align: 'right',
                    render: (r) => `${(p.weights[r.i] * 100).toFixed(1)}%`,
                    className: (r) =>
                      p.weights[r.i] < 0 ? 'text-bloomberg-red' : 'text-bloomberg-white',
                  })),
                ]}
              />
            </div>
          )}
          <p className="text-[11px] text-bloomberg-white/80">
            Covariance:{' '}
            {shrink
              ? `Ledoit-Wolf shrinkage δ = ${finite(corr.shrinkage) ? corr.shrinkage.toFixed(2) : DASH}`
              : 'sample'}{' '}
            · expected returns are historical means, the least reliable input — favor min-variance
            or risk parity.
          </p>
        </>
      )}
    </div>
  );
}

CorrelationSection.propTypes = {
  onAddPeers: PropTypes.func.isRequired,
  peers: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRemovePeer: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  peerErrors: PropTypes.arrayOf(
    PropTypes.shape({ symbol: PropTypes.string, message: PropTypes.string })
  ).isRequired,
  frequency: PropTypes.oneOf(['daily', 'weekly']).isRequired,
  onFrequencyChange: PropTypes.func.isRequired,
  shrink: PropTypes.bool.isRequired,
  onShrinkChange: PropTypes.func.isRequired,
  cap: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  onCapChange: PropTypes.func.isRequired,
  onPairChange: PropTypes.func.isRequired,
  corr: PropTypes.object.isRequired,
};
