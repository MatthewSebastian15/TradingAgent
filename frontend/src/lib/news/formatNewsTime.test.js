import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatNewsTime } from './formatNewsTime';

const NOW = new Date('2026-06-22T12:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatNewsTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('renders only compact units across the ladder', () => {
    expect(formatNewsTime(ago(5 * SEC))).toBe('5s');
    expect(formatNewsTime(ago(5 * MIN))).toBe('5m');
    expect(formatNewsTime(ago(12 * HOUR))).toBe('12h');
    expect(formatNewsTime(ago(3 * DAY))).toBe('3d');
    expect(formatNewsTime(ago(14 * DAY))).toBe('2w');
    expect(formatNewsTime(ago(60 * DAY))).toBe('2mo');
    expect(formatNewsTime(ago(800 * DAY))).toBe('2y');
  });

  it('floors sub-second to 1s and rejects bad input', () => {
    expect(formatNewsTime(ago(0))).toBe('1s');
    expect(formatNewsTime('')).toBe('');
    expect(formatNewsTime('not-a-date')).toBe('');
  });
});
