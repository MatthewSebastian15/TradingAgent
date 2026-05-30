import { describe, expect, it } from 'vitest';

import { validateAnalysisInput } from './analysisContract';

describe('analysisContract validation', () => {
  it.each([0, 6, 100, 'abc'])('rejects invalid max debate rounds: %s', (rounds) => {
    expect(
      validateAnalysisInput({
        activeMarket: 'US',
        ticker: 'NVDA',
        date: '2026-05-14',
        timeHorizonMonths: 1,
        rounds,
        analysisDepth: 'balanced',
        responseDetail: 'full',
      })
    ).toBe('Max debate rounds must be an integer between 1 and 5.');
  });

  it('accepts valid max debate rounds', () => {
    expect(
      validateAnalysisInput({
        activeMarket: 'US',
        ticker: 'NVDA',
        date: '2026-05-14',
        timeHorizonMonths: 1,
        rounds: 3,
        analysisDepth: 'balanced',
        responseDetail: 'full',
      })
    ).toBe('');
  });
});
