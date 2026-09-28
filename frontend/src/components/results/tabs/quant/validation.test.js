import { describe, expect, it } from 'vitest';

import { validateDcf, validateOptions } from './validation';

const dcf = {
  fcf: 1000,
  growth: 8,
  years: 5,
  fadeYears: 3,
  terminalGrowth: 2.5,
  shares: 100,
  waccPct: 9,
  manualWacc: false,
  requireInputs: true,
};

describe('validateDcf', () => {
  it('accepts sensible inputs', () => {
    expect(validateDcf(dcf)).toEqual({});
  });

  it('puts the WACC ≤ g error on terminal growth with CAPM and on WACC when manual', () => {
    expect(validateDcf({ ...dcf, waccPct: 2 }).terminalGrowth).toBe(
      'WACC (2.0%) must be greater than terminal growth.'
    );
    expect(validateDcf({ ...dcf, waccPct: 2, manualWacc: true })).toEqual({
      wacc: 'WACC (2.0%) must be greater than terminal growth.',
    });
  });

  it('checks ranges and required inputs only when asked', () => {
    const errors = validateDcf({
      ...dcf,
      fcf: '',
      shares: 0,
      years: 2.5,
      fadeYears: -1,
      growth: 150,
      terminalGrowth: 12,
    });
    expect(errors).toEqual({
      fcf: 'Enter base free cash flow.',
      shares: 'Shares outstanding must be greater than 0.',
      years: 'Use a whole number of years from 1 to 30.',
      fadeYears: 'Use a whole number of fade years from 0 to 20.',
      growth: 'Growth must be between −50% and 100%.',
      terminalGrowth: 'Terminal growth must be between −5% and 10%.',
    });
    expect(validateDcf({ ...dcf, fcf: '', shares: '', requireInputs: false })).toEqual({});
    expect(validateDcf({ ...dcf, manualWacc: true, waccPct: 60 }).wacc).toBe(
      'WACC must be between 0% and 50%.'
    );
  });
});

describe('validateOptions', () => {
  it('flags each invalid option input', () => {
    expect(validateOptions({ strike: 100, days: 30, volPct: 25, rate: 4, yieldPct: 1 })).toEqual(
      {}
    );
    expect(validateOptions({ strike: 0, days: 0.5, volPct: 0, rate: 150, yieldPct: -1 })).toEqual({
      strike: 'Strike must be greater than 0.',
      days: 'Days to expiry must be a whole number from 1 to 3650.',
      vol: 'Volatility must be above 0% and at most 500%.',
      rate: 'Rate must be between −10% and 100%.',
      yield: 'Dividend yield must be between 0% and 100%.',
    });
  });
});
