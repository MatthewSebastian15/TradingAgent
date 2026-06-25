import { describe, expect, it } from 'vitest';

import { apiToDisplayDate, displayToApiDate } from './useStockForm';

describe('date helpers', () => {
  it('round-trips API <-> display', () => {
    expect(apiToDisplayDate('2026-06-25')).toBe('25-06-2026');
    expect(displayToApiDate('25-06-2026')).toBe('2026-06-25');
  });
  it('returns empty api date on malformed display input', () => {
    expect(displayToApiDate('2026-06-25')).toBe('');
    expect(displayToApiDate('')).toBe('');
  });
});
