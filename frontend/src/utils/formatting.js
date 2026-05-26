export function formatPrice(price, ticker = '') {
  if (price === null || price === undefined || price === '') return null;

  const value = typeof price === 'number' ? price.toLocaleString() : String(price);
  const normalizedTicker = ticker.toUpperCase();

  if (normalizedTicker.endsWith('.JK')) return `Rp ${value}`;
  if (normalizedTicker.endsWith('.HK')) return `HK$ ${value}`;
  if (normalizedTicker.endsWith('.T')) return `\u00a5${value}`;
  if (normalizedTicker.endsWith('.DE')) return `\u20ac${value}`;
  if (normalizedTicker.endsWith('.L')) return `\u00a3${value}`;
  return `$${value}`;
}

export function formatTickerLabel(ticker = '') {
  if (ticker === null || ticker === undefined) return '';
  const normalizedTicker = String(ticker).trim().toUpperCase();
  if (normalizedTicker.endsWith('.JK')) return normalizedTicker.slice(0, -3);
  return String(ticker).trim();
}

export function formatDateTimeLabel(value) {
  if (value === null || value === undefined || value === '') return null;

  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
