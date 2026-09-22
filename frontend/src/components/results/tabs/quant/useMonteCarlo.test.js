import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMonteCarlo } from './useMonteCarlo';

class FakeWorker {
  static instances = [];

  constructor() {
    this.listeners = [];
    this.posted = [];
    FakeWorker.instances.push(this);
  }

  addEventListener(_type, fn) {
    this.listeners.push(fn);
  }

  removeEventListener(_type, fn) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }

  postMessage(message) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  emit(data) {
    this.listeners.forEach((l) => l({ data }));
  }
}

describe('useMonteCarlo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWorker.instances = [];
  });

  it('computes synchronously when Worker is unavailable (jsdom)', () => {
    const request = { method: 'gbm', args: [100, 0, 0, 5, 10, 1] };
    const { result } = renderHook(() => useMonteCarlo(request));
    expect(result.current.running).toBe(false);
    expect(result.current.result.percentiles.p50).toBeCloseTo(100, 10);
  });

  it('uses a worker and ignores stale replies', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const first = { method: 'gbm', args: [100, 0, 0, 5, 10, 1] };
    const second = { method: 'gbm', args: [100, 0, 0, 5, 10, 2] };
    const { result, rerender } = renderHook(({ request }) => useMonteCarlo(request), {
      initialProps: { request: first },
    });
    expect(result.current.running).toBe(true);
    const worker = FakeWorker.instances[0];
    const staleId = worker.posted[0].id;

    rerender({ request: second });
    const freshId = worker.posted[1].id;
    act(() => worker.emit({ id: staleId, result: { tag: 'stale' } }));
    expect(result.current.running).toBe(true);
    act(() => worker.emit({ id: freshId, result: { tag: 'fresh' } }));
    expect(result.current).toEqual({ result: { tag: 'fresh' }, running: false });
  });
});
