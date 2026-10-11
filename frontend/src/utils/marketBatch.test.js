import { afterEach, describe, expect, it, vi } from 'vitest';

import { chunk, fetchInBatches, QUOTE_BATCH_SIZE, withDeadline, withRetry } from './marketBatch';

const symbolsOf = (count) => Array.from({ length: count }, (_, index) => `S${index}`);

describe('chunk', () => {
  it.each([
    [0, 0],
    [1, 1],
    [20, 1],
    [21, 2],
    [100, 5],
  ])('splits %i items into %i batches and keeps order', (count, batches) => {
    const items = symbolsOf(count);
    const out = chunk(items);
    expect(out).toHaveLength(batches);
    expect(out.every((batch) => batch.length <= QUOTE_BATCH_SIZE)).toBe(true);
    expect(out.flat()).toEqual(items);
  });
});

describe('fetchInBatches', () => {
  it('delivers each batch through onBatch and reports no failures', async () => {
    const seen = [];
    const { failed } = await fetchInBatches(symbolsOf(45), async (batch) => batch, {
      onBatch: (data) => seen.push(data.length),
    });
    expect(seen.sort((a, b) => b - a)).toEqual([20, 20, 5]);
    expect(failed).toEqual([]);
  });

  it('never runs more than 3 batches at once', async () => {
    let active = 0;
    let peak = 0;
    const fetchBatch = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return [];
    };
    await fetchInBatches(symbolsOf(200), fetchBatch);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('isolates a failing batch without touching healthy ones', async () => {
    const seen = [];
    const fetchBatch = async (batch) => {
      if (batch.includes('S0')) throw new Error('vendor down');
      return batch;
    };
    const { failed } = await fetchInBatches(symbolsOf(25), fetchBatch, {
      onBatch: (data) => seen.push(...data),
    });
    expect(seen).toEqual(symbolsOf(25).slice(20));
    expect(failed).toHaveLength(1);
    expect(failed[0].symbols).toHaveLength(20);
    expect(failed[0].error.message).toBe('vendor down');
  });

  it('does not bisect non-400 errors', async () => {
    const fetchBatch = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { status: 503 });
    });
    const { failed } = await fetchInBatches(symbolsOf(4), fetchBatch);
    expect(fetchBatch).toHaveBeenCalledTimes(1);
    expect(failed).toHaveLength(1);
  });

  it('bisects a 400 so one bad symbol cannot blank the rest', async () => {
    const fetchBatch = async (batch) => {
      if (batch.includes('BAD')) {
        throw Object.assign(new Error('Invalid ticker symbol.'), { status: 400 });
      }
      return batch;
    };
    const seen = [];
    const { failed } = await fetchInBatches(['A', 'B', 'BAD', 'C'], fetchBatch, {
      onBatch: (data) => seen.push(...data),
    });
    expect(seen.sort()).toEqual(['A', 'B', 'C']);
    expect(failed).toHaveLength(1);
    expect(failed[0].symbols).toEqual(['BAD']);
  });

  it('propagates AbortError', async () => {
    const fetchBatch = async () => {
      throw new DOMException('aborted', 'AbortError');
    };
    await expect(fetchInBatches(symbolsOf(3), fetchBatch)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

afterEach(() => vi.useRealTimers());

// Like fetch: rejects at once on an already-aborted signal, else when it aborts later.
const abortable = (signal) =>
  new Promise((_, reject) => {
    const fail = () => reject(new DOMException('aborted', 'AbortError'));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail);
  });

describe('withDeadline', () => {
  it('rejects with code TIMEOUT when the call outlives the deadline', async () => {
    vi.useFakeTimers();
    const promise = withDeadline(abortable, { timeoutMs: 100 });
    const assertion = expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('keeps a parent abort as an AbortError, not a timeout', async () => {
    const parent = new AbortController();
    const promise = withDeadline(abortable, { signal: parent.signal, timeoutMs: 1000 });
    parent.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('resolves normally and clears its timer', async () => {
    await expect(withDeadline(async () => 'ok', { timeoutMs: 100 })).resolves.toBe('ok');
  });
});

describe('withRetry', () => {
  const transient = () => Object.assign(new Error('boom'), { status: 503 });

  it('retries transient errors with backoff, then succeeds', async () => {
    const wait = vi.fn(async () => {});
    let calls = 0;
    const run = async () => {
      calls += 1;
      if (calls < 3) throw transient();
      return 'ok';
    };
    await expect(withRetry(run, { wait })).resolves.toBe('ok');
    expect(calls).toBe(3);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait.mock.calls[1][0]).toBeGreaterThan(wait.mock.calls[0][0]);
  });

  it('gives up after the retry budget', async () => {
    const wait = vi.fn(async () => {});
    const run = vi.fn(async () => {
      throw transient();
    });
    await expect(withRetry(run, { wait, retries: 2 })).rejects.toMatchObject({ status: 503 });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['400', Object.assign(new Error('bad'), { status: 400 })],
    ['plain error', new Error('plain')],
    ['abort', new DOMException('aborted', 'AbortError')],
  ])('does not retry a %s', async (_label, error) => {
    const run = vi.fn(async () => {
      throw error;
    });
    await expect(withRetry(run, { wait: async () => {} })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries network TypeErrors and timeouts', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(Object.assign(new Error('t'), { code: 'TIMEOUT' }))
      .mockResolvedValue('ok');
    await expect(withRetry(run, { wait: async () => {} })).resolves.toBe('ok');
  });
});
