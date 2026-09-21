export const CHART_COLORS = {
  primary: '#f97316',
  secondary: '#a3a3a3',
  tertiary: '#3b82f6',
  quaternary: '#06b6d4',
  warning: '#eab308',
  up: '#22c55e',
  down: '#ef4444',
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(255,255,255,0.22)',
  text: '#a3a3a3',
  crosshair: 'rgba(255,255,255,0.4)',
  band: 'rgba(249,115,22,0.16)',
  bandInner: 'rgba(249,115,22,0.32)',
};

const CARD_BG = 0x16;
const DARK_TEXT = '#0a0a0a';
const LIGHT_TEXT = '#e5e5e5';

function diverging(value, max) {
  const t = Math.min(1, Math.abs(value) / (max || 1));
  const [r, g, b] = value >= 0 ? [249, 115, 22] : [59, 130, 246];
  return { r, g, b, alpha: Number((0.08 + 0.72 * t).toFixed(2)) };
}

// Blue (negative) <-> orange (positive). Green/red stay reserved for price direction.
export function divergingColor(value, max = 1) {
  if (!Number.isFinite(value)) return 'transparent';
  const { r, g, b, alpha } = diverging(value, max);
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

function luminance(channels) {
  const [r, g, b] = channels.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const DARK_LUM = luminance([0x0a, 0x0a, 0x0a]);
const LIGHT_LUM = luminance([0xe5, 0xe5, 0xe5]);

// Picks whichever text colour has the higher WCAG contrast against the cell
// (diverging colour blended over the card background).
export function textOnDiverging(value, max = 1) {
  if (!Number.isFinite(value)) return LIGHT_TEXT;
  const { r, g, b, alpha } = diverging(value, max);
  const bg = luminance([r, g, b].map((c) => c * alpha + CARD_BG * (1 - alpha)));
  const dark = (bg + 0.05) / (DARK_LUM + 0.05);
  const light = (LIGHT_LUM + 0.05) / (bg + 0.05);
  return dark > light ? DARK_TEXT : LIGHT_TEXT;
}
