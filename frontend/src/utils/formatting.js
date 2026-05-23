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
