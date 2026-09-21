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

  it('exposes the brand primary color', () => {
    expect(CHART_COLORS.primary).toBe('#f97316');
  });
});
