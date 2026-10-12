import { describe, expect, it, vi } from 'vitest';

vi.mock('./secureStorage', () => ({
  encryptJSON: async (value) => JSON.stringify(value),
  decryptJSON: async (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
}));

import { signalFromResult } from './trackSignal';

describe('signalFromResult with the real history normalizer', () => {
  it('produces the same fields the sidebar signal has, including stop/target', () => {
    const signal = signalFromResult({
      request_id: 'r7',
      normalized_ticker: 'NVDA',
      ticker: 'nvda',
      final_decision: 'Buy',
      market: 'US',
      confidence_score: 0.72, // fraction in → percent out, like history rows
      confidence_tier: 'high',
      time_horizon_months: 2,
      stop_loss: 90,
      take_profit: 130,
      trade_date: '2026-10-01',
    });

    expect(signal).toMatchObject({
      id: 'r7',
      ticker: 'NVDA',
      confidence_score: 72,
      time_horizon_months: 2,
      stop_loss: 90,
      take_profit: 130,
    });
  });
});
