import { Plus } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

import { SIDEBAR_EXPANDED_WIDTH } from '../../constants/sidebar';
import { decisionStyle, formatHistoryHorizon } from '../../hooks/useAnalysisHistoryStore';

function shortDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '-';
}

export default function SignalsSidebar({ signals, trackedIds, trackingId, error, onTrack }) {
  return (
    <aside
      className={`fixed bottom-0 right-0 top-[60px] z-30 flex ${SIDEBAR_EXPANDED_WIDTH} flex-col border-l border-bloomberg-border bg-black font-mono text-bloomberg-white`}
    >
      <div className="border-b border-bloomberg-border bg-bloomberg-card px-2 py-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-bloomberg-orange">
          Signals
        </h2>
      </div>

      {error && (
        <div
          role="alert"
          className="border-b border-bloomberg-border px-2 py-1.5 text-[10px] text-bloomberg-red"
        >
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {signals.length === 0 ? (
          <div className="px-2 py-6 text-[11px] text-bloomberg-muted">
            No analyses yet. Run an analysis in AI Agent to generate signals.
          </div>
        ) : (
          signals.map((signal) => {
            const tracked = trackedIds.has(signal.id);
            const busy = trackingId === signal.id;
            const horizon = formatHistoryHorizon(signal.time_horizon_months);
            return (
              <div
                key={signal.id}
                className="flex items-center gap-2 border-b border-bloomberg-border px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-bold text-bloomberg-orange">
                      {signal.ticker}
                    </span>
                    <span
                      className={`border px-1 text-[8px] font-bold uppercase ${decisionStyle(
                        signal.decision
                      )}`}
                    >
                      {signal.decision || signal.display_signal || '-'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-wider text-bloomberg-muted">
                    {shortDate(signal.analysis_created_at || signal.trade_date)}
                    {signal.confidence_score == null ? '' : ` · C${signal.confidence_score}`}
                    {horizon ? ` · ${horizon}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onTrack(signal)}
                  disabled={tracked || busy}
                  aria-label={tracked ? `${signal.ticker} tracked` : `Track ${signal.ticker}`}
                  className={`flex h-6 shrink-0 items-center gap-1 border px-1.5 text-[9px] font-bold uppercase ${
                    tracked
                      ? 'cursor-default border-bloomberg-border text-bloomberg-muted'
                      : 'border-bloomberg-orange text-bloomberg-orange hover:bg-bloomberg-orange/10'
                  }`}
                >
                  <Plus size={11} />
                  {tracked ? 'Tracked' : busy ? '...' : 'Track'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

SignalsSidebar.propTypes = {
  signals: PropTypes.arrayOf(PropTypes.object).isRequired,
  trackedIds: PropTypes.instanceOf(Set).isRequired,
  trackingId: PropTypes.string,
  error: PropTypes.string,
  onTrack: PropTypes.func.isRequired,
};
