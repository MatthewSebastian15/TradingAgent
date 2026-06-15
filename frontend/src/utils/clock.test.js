import { describe, expect, it } from 'vitest';

import {
  createClockFormatter,
  resolveClockConfig,
  resolveDeviceTimeZone,
  resolveTimeZoneLabel,
} from './clock';

describe('clock config', () => {
  it('detects the timezone from the device', () => {
    expect(resolveDeviceTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  });

  it('derives the label from the detected timezone offset', () => {
    const date = new Date('2026-05-23T01:02:03Z');
    const config = resolveClockConfig(date);

    expect(config).toEqual({
      timeZone: resolveDeviceTimeZone(),
      label: resolveTimeZoneLabel(resolveDeviceTimeZone(), date),
    });
  });

  it('falls back to UTC when the timezone is invalid', () => {
    expect(resolveTimeZoneLabel('Not/AZone')).toBe('UTC');
  });

  it('formats using the resolved timezone', () => {
    const formatter = createClockFormatter({ timeZone: 'UTC', label: 'UTC' });

    expect(formatter.format(new Date('2026-05-23T01:02:03Z'))).toBe('01:02:03');
  });
});
