import { describe, expect, it } from 'vitest';

import { zipRollingToDates } from './series';

describe('zipRollingToDates', () => {
  it('maps rolling index i to dates[window + i] and drops non-finite values', () => {
    const dates = ['d0', 'd1', 'd2', 'd3', 'd4'];
    expect(zipRollingToDates([1, null, 3], dates, 2)).toEqual([
      { date: 'd2', value: 1 },
      { date: 'd4', value: 3 },
    ]);
  });

  it('stops when dates run out', () => {
    expect(zipRollingToDates([1, 2, 3], ['a', 'b', 'c'], 2)).toEqual([{ date: 'c', value: 1 }]);
  });
});
