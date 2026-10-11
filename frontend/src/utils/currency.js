// Quote currency helpers. No FX conversion: amounts stay in the vendor's currency.

// Fallback only: the quote's own `currency` (backend) always wins.
const SUFFIX_CURRENCY = [
  ['.JK', 'IDR'],
  ['.HK', 'HKD'],
  ['.T', 'JPY'],
  ['.DE', 'EUR'],
  ['.L', 'GBp'], // London quotes in pence
];

const PREFIX = { USD: '$', IDR: 'Rp ', HKD: 'HK$', JPY: '¥', EUR: '€', GBP: '£' };
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND', 'CLP']);

export function currencyForSymbol(symbol) {
  const upper = String(symbol || '').toUpperCase();
  const hit = SUFFIX_CURRENCY.find(([suffix]) => upper.endsWith(suffix));
  return hit ? hit[1] : 'USD';
}

export function resolveCurrency(quote, symbol) {
  const reported = typeof quote?.currency === 'string' ? quote.currency.trim() : '';
  return reported || currencyForSymbol(symbol);
}

export function formatMoney(value, currency = 'USD', { signed = false } = {}) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';

  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const rounded = Number(number.toFixed(digits));
  const body = Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  // `rounded` decides the sign so -0.001 prints $0.00, not -$0.00.
  const sign = rounded < 0 ? '-' : signed && rounded > 0 ? '+' : '';
  return `${sign}${PREFIX[currency] ?? `${currency} `}${body}`;
}
