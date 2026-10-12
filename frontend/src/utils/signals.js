import { historyResourceId } from '../hooks/useAnalysisHistoryStore';

export function toSignal(entry) {
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

const when = (signal) => Date.parse(signal.analysis_created_at || signal.trade_date || '') || 0;

// Merge pages: de-duplicate by id (rows shift when analyses arrive between pages; the
// incoming copy is fresher and wins), newest first.
export function mergeSignals(current, incoming) {
  const byId = new Map(current.map((signal) => [signal.id, signal]));
  incoming.forEach((signal) => byId.set(signal.id, signal));
  return Array.from(byId.values()).sort((a, b) => when(b) - when(a));
}
