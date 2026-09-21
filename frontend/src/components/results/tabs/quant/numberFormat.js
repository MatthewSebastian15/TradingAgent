import { DASH } from './format';

// Currencies quoted without minor units on exchanges this app covers.
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'HUF']);
const formatters = new Map();

function formatter(key, options) {
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat('en-US', options));
  return formatters.get(key);
}

const prefix = (ccy) => {
  const code = String(ccy || '').toUpperCase();
  return code ? `${code} ` : '';
};

export function currencyDecimals(ccy) {
  return ZERO_DECIMAL.has(String(ccy || '').toUpperCase()) ? 0 : 2;
}

export function fmtMoney(value, ccy) {
  if (!Number.isFinite(value)) return DASH;
  const d = currencyDecimals(ccy);
  const text = formatter(`money-${d}`, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(value);
  return `${prefix(ccy)}${text}`;
}

export function fmtMoneyCompact(value, ccy) {
  if (!Number.isFinite(value)) return DASH;
  const text = formatter('compact', { notation: 'compact', maximumFractionDigits: 2 }).format(
    value
  );
  return `${prefix(ccy)}${text}`;
}

export function fmtInt(value) {
  if (!Number.isFinite(value)) return DASH;
  return formatter('int', { maximumFractionDigits: 0 }).format(Math.round(value));
}
