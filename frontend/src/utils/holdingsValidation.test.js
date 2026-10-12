import { describe, expect, it } from 'vitest';

import { MAX_LOTS, validateHoldingInput } from './holdingsValidation';

const ok = { ticker: 'aapl', shares: '10', cost_basis: '150.5' };

describe('validateHoldingInput', () => {
  it('normalizes a valid entry (strings or numbers)', () => {
    expect(validateHoldingInput(ok)).toEqual({
      ok: true,
      errors: {},
      value: { ticker: 'AAPL', shares: 10, cost_basis: 150.5 },
    });
    expect(validateHoldingInput({ ticker: 'BBCA.JK', shares: 5, cost_basis: 0 }).ok).toBe(true);
  });

  it('reports every invalid field at once', () => {
    const result = validateHoldingInput({ ticker: '', shares: '', cost_basis: '' });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['cost_basis', 'shares', 'ticker']);
  });

  it('rejects symbols the server would reject', () => {
    for (const ticker of ['A B', '@@@', 'THISSYMBOLISWAYTOOLONG', 'AAPL!']) {
      expect(validateHoldingInput({ ...ok, ticker }).errors.ticker).toBeTruthy();
    }
    for (const ticker of ['^GSPC', 'BTC-USD', 'ES=F', 'BBCA.JK']) {
      expect(validateHoldingInput({ ...ok, ticker }).errors.ticker).toBeUndefined();
    }
  });

  it('enforces positive shares and non-negative cost', () => {
    expect(validateHoldingInput({ ...ok, shares: '0' }).errors.shares).toMatch(/greater than zero/);
    expect(validateHoldingInput({ ...ok, shares: '-1' }).errors.shares).toMatch(/number/);
    expect(validateHoldingInput({ ...ok, cost_basis: '-5' }).errors.cost_basis).toMatch(/number/);
    expect(validateHoldingInput({ ...ok, cost_basis: '0' }).ok).toBe(true);
  });

  it('refuses commas and ambiguous dot-grouped integers instead of misparsing them', () => {
    expect(validateHoldingInput({ ...ok, shares: '1,000' }).errors.shares).toMatch(
      /dot for decimals/
    );
    expect(validateHoldingInput({ ...ok, shares: '10.000' }).errors.shares).toMatch(/ambiguous/);
    expect(validateHoldingInput({ ...ok, shares: '1.234.567' }).errors.shares).toMatch(/ambiguous/);
  });

  it('keeps legitimate fractions and decimals', () => {
    expect(validateHoldingInput({ ...ok, shares: '0.500' }).value.shares).toBe(0.5);
    expect(validateHoldingInput({ ...ok, shares: '12.5' }).value.shares).toBe(12.5);
    expect(validateHoldingInput({ ...ok, shares: '.25' }).value.shares).toBe(0.25);
    expect(validateHoldingInput({ ...ok, cost_basis: '9500' }).value.cost_basis).toBe(9500);
  });

  it('rejects absurd magnitudes and non-finite numbers', () => {
    expect(validateHoldingInput({ ...ok, shares: 1e13 }).errors.shares).toMatch(/too large/);
    expect(validateHoldingInput({ ...ok, shares: Infinity }).errors.shares).toBeTruthy();
    expect(validateHoldingInput({ ...ok, shares: 'abc' }).errors.shares).toMatch(/number/);
  });

  it('exports the lot cap', () => {
    expect(MAX_LOTS).toBe(500);
  });
});
