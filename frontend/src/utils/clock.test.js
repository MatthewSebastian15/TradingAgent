import { describe, expect, it } from 'vitest';

import { createClockFormatter, resolveClockConfig } from './clock';

describe('clock config', () => {
  it('defaults to Indonesia time without hardcoding the label in Navbar', () => {
    expect(resolveClockConfig({})).toEqual({
      timeZone: 'Asia/Jakarta',
      label: 'WIB',
    });
  });

  it('uses explicit Vite clock timezone and label overrides', () => {
    expect(
      resolveClockConfig({
        VITE_CLOCK_TIME_ZONE: 'Asia/Singapore',
        VITE_CLOCK_LABEL: 'SGT',
      })
    ).toEqual({
      timeZone: 'Asia/Singapore',
      label: 'SGT',
    });
  });

  it('falls back to a safe clock config when the timezone is invalid', () => {
    expect(
      resolveClockConfig({
        VITE_CLOCK_TIME_ZONE: 'Not/AZone',
        VITE_CLOCK_LABEL: 'BAD',
      })
    ).toEqual({
      timeZone: 'Asia/Jakarta',
      label: 'WIB',
    });
  });

  it('formats using the resolved timezone', () => {
    const formatter = createClockFormatter({ timeZone: 'UTC', label: 'UTC' });

    expect(formatter.format(new Date('2026-05-23T01:02:03Z'))).toBe('01:02:03');
  });
});
