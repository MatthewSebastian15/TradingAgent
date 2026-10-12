import { addTracked } from './portfolioStore';
import { getMarketQuotes } from '../api/market';
import { normalizeBackendHistory } from '../hooks/useAnalysisHistoryStore';
import { QUOTE_TIMEOUT_MS, withDeadline, withRetry } from '../utils/marketBatch';
import { toPrice } from '../utils/price';
import { toSignal } from '../utils/signals';
import { normalizeWatchlistSymbol } from '../utils/watchlistFormatters';

// Live quote at the moment of tracking; null when the vendor has no usable price.
export async function fetchEntryPrice(ticker, { signal } = {}) {
  const data = await withRetry(
    () =>
      withDeadline((deadlineSignal) => getMarketQuotes([ticker], { signal: deadlineSignal }), {
        signal,
        timeoutMs: QUOTE_TIMEOUT_MS,
      }),
    { signal }
  );
  const wanted = normalizeWatchlistSymbol(ticker);
  const quotes = data?.quotes || [];
  // The server may canonicalize the symbol (a plain IDX ticker), so fall back to the only quote.
  const quote =
    quotes.find((item) => normalizeWatchlistSymbol(item.sym || item.symbol) === wanted) ||
    quotes[0];
  return toPrice(quote?.price);
}

const FIELDS = [
  'id',
  'ticker',
  'market',
  'decision',
  'display_signal',
  'confidence_score',
  'confidence_tier',
  'time_horizon_months',
  'analysis_created_at',
  'trade_date',
  'stop_loss',
  'take_profit',
];

// signal: the shape produced by utils/signals.js toSignal().
export async function trackSignal(signal, { track = addTracked, signal: abortSignal } = {}) {
  let entryPrice;
  try {
    entryPrice = await fetchEntryPrice(signal.ticker, { signal: abortSignal });
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, reason: 'aborted' };
    return { ok: false, reason: error?.code === 'TIMEOUT' ? 'timeout' : 'network' };
  }
  if (entryPrice === null) return { ok: false, reason: 'no_price' };

  const record = Object.fromEntries(FIELDS.map((key) => [key, signal[key]]));
  const saved = await track({
    ...record,
    entry_price: entryPrice,
    entry_at: new Date().toISOString(),
  });
  return saved?.ok === false ? { ok: false, reason: saved.reason } : { ok: true, entryPrice };
}

// A finished analysis result → the same signal shape the sidebar uses (null if not trackable).
export function signalFromResult(result) {
  if (!result || result.error) return null;
  const [entry] = normalizeBackendHistory([result]);
  return entry ? toSignal(entry) : null;
}
