// Golden-file parity: the JS side of the quant math contract.
// The Python mirror is packages/tests/test_quant_parity.py. Both consume
// packages/tests/fixtures/quant_parity.json, so a formula change on either
// side fails exactly one suite instead of silently diverging (audit DUP-001).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { annualizedVol, maxDrawdown } from './quantUtils';

// vitest runs with cwd = frontend/
const fixturePath = resolve(process.cwd(), '../packages/tests/fixtures/quant_parity.json');
const parity = JSON.parse(readFileSync(fixturePath, 'utf-8'));

describe('quant parity with the Python engine', () => {
  it('annualizedVol matches the golden value', () => {
    expect(annualizedVol(parity.closes)).toBeCloseTo(parity.expected.annualized_vol_percent, 9);
  });

  it('maxDrawdown matches the golden value', () => {
    expect(maxDrawdown(parity.closes)).toBeCloseTo(parity.expected.max_drawdown_percent, 9);
  });
});
