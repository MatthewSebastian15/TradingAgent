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

// Blue (negative) ↔ orange (positive). Green/red stay reserved for price direction.
export function divergingColor(value, max = 1) {
  if (!Number.isFinite(value)) return 'transparent';
  const t = Math.min(1, Math.abs(value) / (max || 1));
  const [r, g, b] = value >= 0 ? [249, 115, 22] : [59, 130, 246];
  return `rgba(${r},${g},${b},${(0.08 + 0.72 * t).toFixed(2)})`;
}

export function textOnDiverging(value, max = 1) {
  return Number.isFinite(value) && Math.abs(value) / (max || 1) > 0.6 ? '#0a0a0a' : '#e5e5e5';
}
