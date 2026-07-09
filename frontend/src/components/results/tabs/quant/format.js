export function regimeLabel(pct) {
  if (!finite(pct)) return { label: 'Unknown', tone: 'neutral' };
  if (pct < 33) return { label: 'Calm', tone: 'good' };
  if (pct < 66) return { label: 'Normal', tone: 'neutral' };
  return { label: 'Stressed', tone: 'bad' };
}

export function hurstLabel(h) {
  if (!finite(h)) return 'Unknown';
  if (h > 0.55) return 'Trending';
  if (h < 0.45) return 'Mean-reverting';
  return 'Random walk';
}

// --- formatting -----------------------------------------------------------
export const finite = (v) => v !== null && Number.isFinite(v);
export const DASH = '—';

export function fmtPercent(v) {
  return finite(v) ? `${v.toFixed(1)}%` : DASH;
}
// Loss figures are negative; the sign itself is the colorblind-safe direction cue.
export function fmtLoss(v) {
  return finite(v) ? `${v.toFixed(1)}%` : DASH;
}
export function fmtAbs(v) {
  return finite(v) ? `${Math.abs(v).toFixed(1)}%` : DASH;
}
// Ratios pair an arrow glyph with color so direction survives without color (4B.6).
export function fmtRatio(v) {
  if (!finite(v)) return DASH;
  return `${v >= 0 ? '▲' : '▼'} ${v.toFixed(2)}`;
}

export function volBucket(vol) {
  if (!finite(vol)) return 'Unknown';
  if (vol < 15) return 'Calm';
  if (vol < 25) return 'Moderate';
  if (vol < 40) return 'Elevated';
  return 'High';
}

// ratio >= 1 is good, < 0 is bad, in between is neutral.
export function ratioTone(v) {
  if (!finite(v)) return 'neutral';
  if (v >= 1) return 'good';
  if (v < 0) return 'bad';
  return 'neutral';
}

export function fmtNum2(v) {
  return finite(v) ? v.toFixed(2) : DASH;
}
// Signed percent: the +/- sign is the colorblind-safe direction cue (4B.6).
export function fmtSignedPct(v) {
  return finite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : DASH;
}
export function signedTone(v) {
  if (!finite(v)) return 'neutral';
  if (v > 0) return 'good';
  if (v < 0) return 'bad';
  return 'neutral';
}
