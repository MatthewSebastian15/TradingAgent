import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { getMarketQuotes } from '../api/market';
import Navbar from '../components/Navbar';
import PortfolioSummaryBar from '../components/portfolio/PortfolioSummaryBar';
import SignalsSidebar from '../components/portfolio/SignalsSidebar';
import TrackedPositionsTable from '../components/portfolio/TrackedPositionsTable';
import { historyResourceId, readHistory } from '../hooks/useAnalysisHistoryStore';
import { usePortfolioStore } from '../hooks/usePortfolioStore';
import { useWatchlistQuotes } from '../hooks/useWatchlistQuotes';
import { summarize } from '../utils/portfolioPerf';
import { normalizeWatchlistSymbol } from '../utils/watchlistFormatters';

const HISTORY_KEY = 'ta_analysis_history';

function toSignal(entry) {
  const id = historyResourceId(entry);
  if (!id || !entry.ticker) return null;
  return {
    id,
    ticker: entry.ticker,
    market: entry.market,
    decision: entry.decision || entry.display_signal,
    display_signal: entry.display_signal,
    confidence_score: entry.confidence_score,
    confidence_tier: entry.confidence_tier,
    time_horizon_months: entry.time_horizon_months,
    analysis_created_at: entry.analysis_created_at,
    trade_date: entry.trade_date,
  };
}

export default function Portfolio() {
  const { tracked, trackedIds, track, untrack } = usePortfolioStore();
  const [signals, setSignals] = useState([]);
  const [trackingId, setTrackingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    readHistory(HISTORY_KEY).then((entries) => {
      if (!alive) return;
      setSignals(entries.map(toSignal).filter(Boolean));
    });
    return () => {
      alive = false;
    };
  }, []);

  const symbols = useMemo(() => {
    const all = [...tracked.map((t) => t.ticker), ...signals.map((s) => s.ticker)];
    return Array.from(new Set(all.map(normalizeWatchlistSymbol).filter(Boolean)));
  }, [tracked, signals]);

  const { quotesBySymbol, trendsBySymbol } = useWatchlistQuotes(symbols);

  const priceFor = useCallback(
    (ticker) => Number(quotesBySymbol.get(normalizeWatchlistSymbol(ticker))?.price),
    [quotesBySymbol]
  );

  const rows = useMemo(
    () =>
      tracked.map((position) => {
        const key = normalizeWatchlistSymbol(position.ticker);
        return {
          position,
          current: Number(quotesBySymbol.get(key)?.price),
          trend: trendsBySymbol.get(key) || [],
        };
      }),
    [tracked, quotesBySymbol, trendsBySymbol]
  );

  const summary = useMemo(() => summarize(tracked, priceFor), [tracked, priceFor]);

  const handleTrack = useCallback(
    async (signal) => {
      setTrackingId(signal.id);
      setError('');
      try {
        const data = await getMarketQuotes([signal.ticker]);
        const want = normalizeWatchlistSymbol(signal.ticker);
        const quote =
          (data?.quotes || []).find((q) => normalizeWatchlistSymbol(q.sym || q.symbol) === want) ||
          data?.quotes?.[0];
        const entryPrice = Number(quote?.price);
        if (!Number.isFinite(entryPrice)) {
          throw new Error(`No live price for ${signal.ticker}.`);
        }
        await track({
          id: signal.id,
          ticker: signal.ticker,
          market: signal.market,
          decision: signal.decision,
          display_signal: signal.display_signal,
          confidence_score: signal.confidence_score,
          confidence_tier: signal.confidence_tier,
          time_horizon_months: signal.time_horizon_months,
          entry_price: entryPrice,
          entry_at: new Date().toISOString(),
          analysis_created_at: signal.analysis_created_at,
          trade_date: signal.trade_date,
        });
      } catch (err) {
        setError(err.message || 'Failed to track signal.');
      } finally {
        setTrackingId(null);
      }
    },
    [track]
  );

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-12">
      <Navbar />
      <main className="space-y-3 px-4 py-4 md:pr-[296px]">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.35em] text-bloomberg-orange">
            ■ Portfolio — AI Recommendation Tracker
          </h1>
        </div>

        <PortfolioSummaryBar summary={summary} />
        <TrackedPositionsTable rows={rows} onRemove={untrack} />

        <p className="font-mono text-[10px] leading-relaxed text-bloomberg-muted">
          Tracked performance is directional by the AI&apos;s decision and is a research tool, not
          financial advice. Entry prices are frozen at the moment you track a signal.
        </p>
      </main>

      <SignalsSidebar
        signals={signals}
        trackedIds={trackedIds}
        trackingId={trackingId}
        error={error}
        onTrack={handleTrack}
      />
    </div>
  );
}
