import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the first value at once and later values after the delay', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 150), {
      initialProps: { v: 1 },
    });
    expect(result.current).toBe(1);

    rerender({ v: 2 });
    act(() => vi.advanceTimersByTime(100));
    rerender({ v: 3 });
    act(() => vi.advanceTimersByTime(149));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(3);
  });
});
