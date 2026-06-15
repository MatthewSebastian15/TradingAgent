export function formatPrice(price, ticker = '', currency = '') {
  if (price === null || price === undefined || price === '') return null;
  if (typeof price === 'number' && !Number.isFinite(price)) return null;

  const value = typeof price === 'number' ? price.toLocaleString() : String(price);
  const normalizedTicker = String(ticker || '').toUpperCase();
  const normalizedCurrency = String(currency || '').toUpperCase();

  if (normalizedCurrency === 'IDR' || normalizedTicker.endsWith('.JK')) return `Rp ${value}`;
  if (normalizedCurrency === 'HKD' || normalizedTicker.endsWith('.HK')) return `HK$ ${value}`;
  if (normalizedCurrency === 'JPY' || normalizedTicker.endsWith('.T')) return `¥${value}`;
  if (normalizedCurrency === 'EUR' || normalizedTicker.endsWith('.DE')) return `€${value}`;
  if (normalizedCurrency === 'GBP' || normalizedTicker.endsWith('.L')) return `£${value}`;
  if (normalizedCurrency === 'USD' || !normalizedCurrency) return `$${value}`;
  return `${normalizedCurrency} ${value}`;
}

export function formatTickerLabel(ticker = '') {
  if (ticker === null || ticker === undefined) return '';
  return String(ticker).trim().toUpperCase();
}

export function formatTradeDateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value || '';
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
