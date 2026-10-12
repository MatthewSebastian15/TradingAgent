import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { getMarketQuotes } from '../api/market';
import HoldingsSummaryBar from '../components/portfolio/HoldingsSummaryBar';
import HoldingsTable from '../components/portfolio/HoldingsTable';
import PortfolioSummaryBar from '../components/portfolio/PortfolioSummaryBar';
import SignalsSidebar from '../components/portfolio/SignalsSidebar';
import TrackedPositionsTable from '../components/portfolio/TrackedPositionsTable';
import {
  historyResourceId,
  normalizeBackendHistory,
  readHistory,
  writeHistory,
} from '../hooks/useAnalysisHistoryStore';
import { useHoldingsStore } from '../hooks/useHoldingsStore';
import { usePortfolioStore } from '../hooks/usePortfolioStore';
import { useWatchlistQuotes } from '../hooks/useWatchlistQuotes';
import { fetchAnalysisHistory } from '../utils/analysisHistoryApi';
import { resolveCurrency } from '../utils/currency';
import { summarizeByCurrency } from '../utils/holdingsPerf';
import { validateHoldingInput } from '../utils/holdingsValidation';
import { summarize } from '../utils/portfolioPerf';
import { symbolsForTab } from '../utils/portfolioSymbols';
import { toPrice } from '../utils/price';
import { normalizeWatchlistSymbol } from '../utils/watchlistFormatters';

const HISTORY_KEY = 'ta_analysis_history';

const TABS = [
  { id: 'ai', label: 'AI Tracker' },
  { id: 'holdings', label: 'My Holdings' },
];

const SAVE_ERRORS = {
  unreadable:
    'Saved data on this device could not be read. Start fresh or restore a backup before saving changes.',
  write_failed: 'Could not save: browser storage is full or blocked.',
  invalid: 'That entry is not valid.',
  limit: 'You can store up to 500 lots. Remove or merge some first.',
  not_found: 'That lot no longer exists.',
};

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
  const { holdings, pending, add: addHolding, remove: removeHolding } = useHoldingsStore();
  const [tab, setTab] = useState('ai');
  const [signals, setSignals] = useState([]);
  const [trackingId, setTrackingId] = useState(null);
  const [error, setError] = useState('');
  const [holdingsError, setHoldingsError] = useState('');

  useEffect(() => {
    // Backend `analyses` is authoritative; localStorage is its offline mirror.
    // Match HistoryPanel: fetch backend, refresh the mirror, fall back on failure.
    let alive = true;
    const controller = new AbortController();
    const apply = (entries) => alive && setSignals(entries.map(toSignal).filter(Boolean));

    fetchAnalysisHistory({ limit: 25, signal: controller.signal })
      .then(async (data) => {
        if (controller.signal.aborted) return;
        const items = normalizeBackendHistory(data);
        await writeHistory(HISTORY_KEY, items);
        apply(items);
      })
      .catch(async (error) => {
        if (error.name === 'AbortError') return;
        apply(await readHistory(HISTORY_KEY));
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const symbols = useMemo(
    () => symbolsForTab(tab, { tracked, holdings }),
    [tab, tracked, holdings]
  );

  const { quotesBySymbol, trendsBySymbol } = useWatchlistQuotes(symbols);

  const priceFor = useCallback(
    (ticker) => toPrice(quotesBySymbol.get(normalizeWatchlistSymbol(ticker))?.price),
    [quotesBySymbol]
  );

  const rows = useMemo(
    () =>
      tracked.map((position) => {
        const key = normalizeWatchlistSymbol(position.ticker);
        return {
          position,
          current: toPrice(quotesBySymbol.get(key)?.price),
          trend: trendsBySymbol.get(key) || [],
        };
      }),
    [tracked, quotesBySymbol, trendsBySymbol]
  );

  const holdingRows = useMemo(
    () =>
      holdings.map((holding) => {
        const key = normalizeWatchlistSymbol(holding.ticker);
        const quote = quotesBySymbol.get(key);
        return {
          holding,
          price: toPrice(quote?.price),
          chg: quote?.chg,
          trend: trendsBySymbol.get(key) || [],
          currency: resolveCurrency(quote, holding.ticker),
        };
      }),
    [holdings, quotesBySymbol, trendsBySymbol]
  );

  const summary = useMemo(() => summarize(tracked, priceFor), [tracked, priceFor]);
  const holdingsSummaries = useMemo(() => summarizeByCurrency(holdingRows), [holdingRows]);
  const totalsByCurrency = useMemo(
    () => Object.fromEntries(holdingsSummaries.map((item) => [item.currency, item.totalValue])),
    [holdingsSummaries]
  );

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
        const saved = await track({
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
        if (saved?.ok === false) {
          throw new Error(SAVE_ERRORS[saved.reason] || SAVE_ERRORS.invalid);
        }
      } catch (err) {
        setError(err.message || 'Failed to track signal.');
      } finally {
        setTrackingId(null);
      }
    },
    [track]
  );

  const handleAddHolding = useCallback(
    async (record) => {
      setHoldingsError('');
      const checked = validateHoldingInput(record);
      if (!checked.ok) {
        setHoldingsError(Object.values(checked.errors)[0]);
        return false;
      }
      const result = await addHolding(checked.value);
      if (result?.reason === 'busy') return false; // already saving: stay silent
      if (result?.ok === false) {
        setHoldingsError(SAVE_ERRORS[result.reason] || SAVE_ERRORS.invalid);
        return false;
      }
      return true;
    },
    [addHolding]
  );

  const showSidebar = tab === 'ai';

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-10">
      <main className={`space-y-3 px-4 py-4 ${showSidebar ? 'md:pr-[296px]' : ''}`}>
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.35em] text-bloomberg-orange">
            ■ Portfolio
          </h1>
        </div>

        <div className="flex gap-1 border-b border-bloomberg-border">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${
                tab === id
                  ? 'border-bloomberg-orange text-bloomberg-orange'
                  : 'border-transparent text-bloomberg-muted hover:text-bloomberg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'ai' ? (
          <>
            <PortfolioSummaryBar summary={summary} />
            <TrackedPositionsTable rows={rows} onRemove={untrack} />
            <p className="font-mono text-[10px] leading-relaxed text-bloomberg-muted">
              Tracked performance is directional by the AI&apos;s decision and is a research tool,
              not financial advice. Entry prices are frozen at the moment you track a signal.
            </p>
          </>
        ) : (
          <>
            <HoldingsSummaryBar summaries={holdingsSummaries} />
            <HoldingsTable
              rows={holdingRows}
              totalsByCurrency={totalsByCurrency}
              onAdd={handleAddHolding}
              onRemove={removeHolding}
              error={holdingsError}
              busy={pending}
            />
            <p className="font-mono text-[10px] leading-relaxed text-bloomberg-muted">
              Holdings are entered by you and stored encrypted on this device only. Prices and P/L
              are live; nothing here is financial advice.
            </p>
          </>
        )}
      </main>

      {showSidebar && (
        <SignalsSidebar
          signals={signals}
          trackedIds={trackedIds}
          trackingId={trackingId}
          error={error}
          onTrack={handleTrack}
        />
      )}
    </div>
  );
}
