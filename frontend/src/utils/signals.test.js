import { describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/useAnalysisHistoryStore', () => ({
  historyResourceId: (item) => item.request_id || item.job_id || null,
}));

import { mergeSignals, toSignal } from './signals';

const base = { request_id: 'r1', ticker: 'NVDA', decision: 'BUY', market: 'US' };

describe('toSignal', () => {
  it('maps a history entry and falls back to display_signal for the decision', () => {
    expect(
      toSignal({ ...base, decision: '', display_signal: 'Buy', confidence_score: 70 })
    ).toMatchObject({
      id: 'r1',
      ticker: 'NVDA',
      decision: 'Buy',
      confidence_score: 70,
    });
  });

  it('carries stop-loss and take-profit and defaults them to null', () => {
    expect(toSignal({ ...base, stop_loss: 90, take_profit: 120 })).toMatchObject({
      stop_loss: 90,
      take_profit: 120,
    });
    expect(toSignal(base)).toMatchObject({ stop_loss: null, take_profit: null });
  });

  it('uses job_id when there is no request_id', () => {
    expect(toSignal({ job_id: 'j9', ticker: 'AAPL' }).id).toBe('j9');
  });

  it('returns null without an id or a ticker', () => {
    expect(toSignal({ ticker: 'AAPL' })).toBeNull();
    expect(toSignal({ request_id: 'r1' })).toBeNull();
  });
});

describe('mergeSignals', () => {
  const sig = (id, createdAt, extra = {}) => ({
    id,
    ticker: 'X',
    analysis_created_at: createdAt,
    ...extra,
  });

  it('de-duplicates by id (incoming wins) and sorts newest first', () => {
    const merged = mergeSignals(
      [sig('a', '2026-05-01T00:00:00Z'), sig('b', '2026-05-03T00:00:00Z', { decision: 'OLD' })],
      [sig('b', '2026-05-03T00:00:00Z', { decision: 'NEW' }), sig('c', '2026-05-02T00:00:00Z')]
    );

    expect(merged.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(merged[0].decision).toBe('NEW');
  });

  it('keeps entries without a date at the end and does not mutate its inputs', () => {
    const current = [sig('a', undefined), sig('b', '2026-05-03T00:00:00Z')];
    const snapshot = JSON.stringify(current);

    expect(mergeSignals(current, []).map((s) => s.id)).toEqual(['b', 'a']);
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});
