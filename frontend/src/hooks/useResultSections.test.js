import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useResultSections } from './useResultSections';

function resultWithPoints(count) {
  return { price_chart: { points: Array.from({ length: count }, (_, i) => i) } };
}

describe('useResultSections', () => {
  it('returns null vm and disables quant when result is absent', () => {
    const build = vi.fn();
    const { result } = renderHook(() => useResultSections(null, build));

    expect(result.current.vm).toBeNull();
    expect(result.current.disabledTabs).toEqual(['quant']);
    expect(build).not.toHaveBeenCalled();
  });

  it('disables quant below 30 price points, enables at 30+', () => {
    const build = (r) => ({ from: r });

    const short = renderHook(() => useResultSections(resultWithPoints(29), build));
    expect(short.result.current.disabledTabs).toEqual(['quant']);

    const long = renderHook(() => useResultSections(resultWithPoints(30), build));
    expect(long.result.current.disabledTabs).toEqual([]);
    expect(long.result.current.vm).toEqual({ from: resultWithPoints(30) });
  });

  it('memoizes: same result + builder refs return the same object', () => {
    const build = vi.fn((r) => ({ from: r }));
    const result = resultWithPoints(40);
    const { result: hook, rerender } = renderHook(
      ({ res, builder }) => useResultSections(res, builder),
      { initialProps: { res: result, builder: build } }
    );

    const first = hook.current;
    rerender({ res: result, builder: build });

    expect(hook.current).toBe(first);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
