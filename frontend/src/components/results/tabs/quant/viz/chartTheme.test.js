import { describe, expect, it } from 'vitest';

import { CHART_COLORS, divergingColor, textOnDiverging } from './chartTheme';

describe('chartTheme', () => {
  it('uses orange for positive and blue for negative values', () => {
    expect(divergingColor(0.5)).toContain('249,115,22');
    expect(divergingColor(-0.5)).toContain('59,130,246');
    expect(divergingColor(Number.NaN)).toBe('transparent');
  });

  it('switches to dark text on strong cells', () => {
    expect(textOnDiverging(0.9)).toBe('#0a0a0a');
    expect(textOnDiverging(0.2)).toBe('#e5e5e5');
  });

  it('picks the higher-contrast text colour on every cell strength', () => {
    const lum = ([r, g, b]) =>
      [r, g, b]
        .map((c) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const cell = (value) => {
      const m = divergingColor(value).match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
      const a = Number(m[4]);
      return [1, 2, 3].map((i) => Number(m[i]) * a + 0x16 * (1 - a));
    };
    for (const sign of [1, -1]) {
      for (const t of [0.3, 0.7, 1]) {
        const bg = lum(cell(sign * t));
        const dark = ratio(bg, lum(hex('#0a0a0a')));
        const light = ratio(bg, lum(hex('#e5e5e5')));
        const chosen = textOnDiverging(sign * t);
        expect(['#0a0a0a', '#e5e5e5']).toContain(chosen);
        expect(chosen).toBe(dark > light ? '#0a0a0a' : '#e5e5e5');
      }
    }
  });

  it('exposes the brand primary color', () => {
    expect(CHART_COLORS.primary).toBe('#f97316');
  });
});
