import { describe, expect, it } from 'vitest';

import { DEFAULT_SECTION, SECTION_GROUPS, SECTIONS, sectionById } from './config';

describe('quant section registry', () => {
  it('lists every section once, grouped, with a description', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'overview',
      'volatility',
      'risk',
      'distribution',
      'scenario',
      'stochastic',
      'backtest',
      'sizing',
      'correlation',
      'options',
      'valuation',
    ]);
    const groupIds = SECTION_GROUPS.map((g) => g.id);
    for (const s of SECTIONS) {
      expect(groupIds).toContain(s.group);
      expect(s.description.length).toBeGreaterThan(20);
    }
    for (const g of SECTION_GROUPS) {
      expect(SECTIONS.some((s) => s.group === g.id)).toBe(true);
    }
  });

  it('resolves ids and defaults to overview', () => {
    expect(DEFAULT_SECTION).toBe('overview');
    expect(sectionById('risk').group).toBe('risk');
    expect(sectionById('nope')).toBeNull();
  });
});
