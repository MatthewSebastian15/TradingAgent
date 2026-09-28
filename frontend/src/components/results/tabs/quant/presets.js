// ponytail: plaintext localStorage on purpose — assumptions like years or ERP are UI
// state, not sensitive data (same policy as ta:recent-tickers).
const PREFIX = 'ta:quant:preset:v1:';

const keyFor = (kind, symbol) => `${PREFIX}${kind}:${String(symbol).toUpperCase()}`;

export function loadPreset(kind, symbol) {
  if (!symbol) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(keyFor(kind, symbol)) || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function savePreset(kind, symbol, value) {
  if (!symbol) return;
  try {
    window.localStorage.setItem(keyFor(kind, symbol), JSON.stringify(value));
  } catch {
    // Storage full or blocked: presets are a convenience only.
  }
}

export function clearPreset(kind, symbol) {
  if (!symbol) return;
  try {
    window.localStorage.removeItem(keyFor(kind, symbol));
  } catch {
    // Ignore storage errors.
  }
}
