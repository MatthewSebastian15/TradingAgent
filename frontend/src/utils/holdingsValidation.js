export const MAX_LOTS = 500;
const MAX_AMOUNT = 1e12; // sanity bound: keeps products finite and formatting sane

// Keep in sync with backend/routes/market.py _QUOTE_SYMBOL_RE.
const SYMBOL_PATTERN = /^[A-Z0-9^]{1,15}(?:[.=:-][A-Z0-9]{1,12}){0,3}$/;
// "10.000", "1.234.567": dot-grouped thousands in some locales, a tiny fraction elsewhere.
const AMBIGUOUS_GROUPING = /^[1-9]\d{0,2}(\.\d{3})+$/;
const PLAIN_NUMBER = /^(\d+\.?\d*|\.\d+)$/;

function parseNumber(value, label) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value } : { error: `${label} must be a number.` };
  }
  const text = String(value ?? '').trim();
  if (!text) return { error: `${label} is required.` };
  if (text.includes(',')) {
    return { error: 'Use a dot for decimals and no thousands separators (e.g. 10000.50).' };
  }
  if (AMBIGUOUS_GROUPING.test(text)) {
    const joined = text.replace(/\./g, '');
    const lead = text.split('.')[0];
    return {
      error: `"${text}" is ambiguous. Type ${joined} for ${joined}, or ${lead} for ${lead}.`,
    };
  }
  if (!PLAIN_NUMBER.test(text)) return { error: `${label} must be a number.` };
  return { value: Number(text) };
}

export function validateHoldingInput({ ticker, shares, cost_basis: costBasis } = {}) {
  const errors = {};
  const symbol = String(ticker ?? '')
    .trim()
    .toUpperCase();
  if (!symbol) errors.ticker = 'Enter a ticker symbol.';
  else if (!SYMBOL_PATTERN.test(symbol)) errors.ticker = 'Use a symbol like AAPL or BBCA.JK.';

  const parsedShares = parseNumber(shares, 'Shares');
  if (parsedShares.error) errors.shares = parsedShares.error;
  else if (parsedShares.value <= 0) errors.shares = 'Shares must be greater than zero.';
  else if (parsedShares.value > MAX_AMOUNT) errors.shares = 'That share count is too large.';

  const parsedCost = parseNumber(costBasis, 'Average cost');
  if (parsedCost.error) errors.cost_basis = parsedCost.error;
  else if (parsedCost.value < 0) errors.cost_basis = 'Average cost cannot be negative.';
  else if (parsedCost.value > MAX_AMOUNT) errors.cost_basis = 'That cost is too large.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    errors: {},
    value: { ticker: symbol, shares: parsedShares.value, cost_basis: parsedCost.value },
  };
}
