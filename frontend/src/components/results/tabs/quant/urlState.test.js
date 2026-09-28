import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { readQuantUrl, useUrlState, writeQuantUrl } from './urlState';

const go = (url) => window.history.replaceState({ idx: 3 }, '', url);

describe('quant URL state', () => {
  afterEach(() => go('/quant'));

  it('reads and merges query parameters without losing history state', () => {
    go('/quant?t=AAPL&x=keep');
    expect(readQuantUrl()).toEqual({ t: 'AAPL', x: 'keep' });

    writeQuantUrl({ s: 'risk', t: null });
    expect(window.location.search).toBe('?x=keep&s=risk');
    expect(window.history.state).toEqual({ idx: 3 });
  });

  it('initialises from the URL, rejects invalid values and drops defaults', () => {
    go('/quant?h=63&r=10Y');
    const horizon = renderHook(() =>
      useUrlState('h', 126, { parse: Number, isValid: (v) => [21, 63, 126].includes(v) })
    );
    const range = renderHook(() =>
      useUrlState('r', '1Y', { isValid: (v) => ['1Y', '5Y'].includes(v) })
    );
    expect(horizon.result.current[0]).toBe(63);
    expect(range.result.current[0]).toBe('1Y');

    act(() => horizon.result.current[1](21));
    expect(readQuantUrl().h).toBe('21');
    act(() => horizon.result.current[1](126));
    expect(readQuantUrl().h).toBeUndefined();
  });

  it('does nothing when disabled', () => {
    go('/quant?st=momentum');
    const { result } = renderHook(() => useUrlState('st', 'sma', { enabled: false }));
    expect(result.current[0]).toBe('sma');
    act(() => result.current[1]('meanrev'));
    expect(readQuantUrl().st).toBe('momentum');
  });
});
