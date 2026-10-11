import { describe, expect, it, vi } from 'vitest';

import { chunk, fetchInBatches, QUOTE_BATCH_SIZE } from './marketBatch';

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
