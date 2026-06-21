import { describe, expect, it } from 'vitest';

import { getCategoryColor } from './categoryColors';

describe('getCategoryColor', () => {
  it('returns all required shape properties', () => {
    const color = getCategoryColor('markets');
    expect(color).toHaveProperty('text');
    expect(color).toHaveProperty('border');
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('activeBg');
  });

  it('returns green for markets', () => {
    const color = getCategoryColor('markets');
    expect(color.text).toBe('#22c55e');
    expect(color.border).toBe('rgba(34, 197, 94, 0.6)');
    expect(color.bg).toBe('rgba(34, 197, 94, 0.12)');
    expect(color.activeBg).toBe('rgba(34, 197, 94, 0.15)');
  });

  it('returns cyan for crypto', () => {
    expect(getCategoryColor('crypto').text).toBe('#06b6d4');
  });

  it('returns red for regulatory', () => {
    expect(getCategoryColor('regulatory').text).toBe('#ef4444');
  });

  it('returns amber for central_bank', () => {
    expect(getCategoryColor('central_bank').text).toBe('#eab308');
  });

  it('returns blue for world', () => {
    expect(getCategoryColor('world').text).toBe('#3b82f6');
  });

  it('returns amber for macro', () => {
    expect(getCategoryColor('macro').text).toBe('#eab308');
  });

  it('returns orange for forex', () => {
    expect(getCategoryColor('forex').text).toBe('#f97316');
  });

  it('returns muted fallback for unknown category', () => {
    expect(getCategoryColor('unknown_xyz').text).toBe('#525252');
  });

  it('returns muted fallback for empty string', () => {
    expect(getCategoryColor('').text).toBe('#525252');
  });

  it('returns muted fallback for null', () => {
    expect(getCategoryColor(null).text).toBe('#525252');
  });
});
