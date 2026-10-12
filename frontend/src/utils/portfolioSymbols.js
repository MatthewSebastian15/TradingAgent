import { normalizeWatchlistSymbol } from './watchlistFormatters';

// Tickers whose quote/trend the visible tab actually renders.
// Signals are deliberately absent: the sidebar shows no price, and pricing them would
// push real positions past the server's 20-symbol cap.
export function symbolsForTab(tab, { tracked = [], holdings = [] } = {}) {
  // A closed tracked position is frozen at its exit price: it needs no live quote.
  const source = tab === 'holdings' ? holdings : tracked.filter((item) => !item.closed_at);
  const unique = new Set(source.map((item) => normalizeWatchlistSymbol(item.ticker)));
  unique.delete('');
  return Array.from(unique).sort();
}
