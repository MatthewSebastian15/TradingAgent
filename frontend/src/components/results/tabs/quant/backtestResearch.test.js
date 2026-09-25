import { describe, expect, it } from 'vitest';

import { backtest } from './backtestLite';
import { bestCell, parameterSweep, SWEEP_GRIDS, walkForward } from './backtestResearch';

const series = Array.from(
  { length: 800 },
  (_, i) => 100 * Math.exp(0.0004 * i + 0.05 * Math.sin(i / 15) + 0.01 * Math.sin(i / 2.3))
);

describe('parameterSweep', () => {
  it('covers the SMA grid, skips invalid cells and matches a direct backtest', () => {
    const sweep = parameterSweep(series, 'sma', { costBps: 5 });
    expect(sweep.cells).toHaveLength(SWEEP_GRIDS.sma.rows.values.length);
    expect(sweep.cells[0]).toHaveLength(SWEEP_GRIDS.sma.cols.values.length);
    const fast20slow20 = sweep.cells[3][0];
    expect(fast20slow20).toBeNull();
    const cell = sweep.cells[1][1];
    expect(cell.sharpe).toBeCloseTo(
      backtest(series, 'sma', { costBps: 5, oosFrac: 0, fast: 10, slow: 50 }).sharpe,
      12
    );
  });

  it('1-D grids have one column', () => {
    const sweep = parameterSweep(series, 'momentum', {});
    expect(sweep.colKey).toBeNull();
    expect(sweep.cells.every((row) => row.length === 1)).toBe(true);
  });
});

describe('walkForward', () => {
  it('chooses parameters from training data only', () => {
    const wf = walkForward(series, 'sma', {});
    expect(wf.folds.length).toBeGreaterThan(0);
    expect(wf.folds.length).toBeLessThanOrEqual(4);
    const first = wf.folds[0];
    const expected = bestCell(parameterSweep(series.slice(0, first.testStart), 'sma', {}));
    expect(first.params).toEqual(expected.params);
    expect(first.trainEnd).toBe(first.testStart);
    expect(Number.isFinite(wf.oosReturn)).toBe(true);
  });

  it('returns null when test windows would be too short', () => {
    expect(walkForward(series.slice(0, 150), 'sma', {})).toBeNull();
  });
});
