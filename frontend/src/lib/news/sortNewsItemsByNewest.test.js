import { describe, expect, it } from 'vitest';

import { sortNewsItemsByNewest } from './sortNewsItemsByNewest';

describe('sortNewsItemsByNewest', () => {
  it('sorts descending by publishedAt', () => {
    const result = sortNewsItemsByNewest([
      { id: 'old', publishedAt: '2026-01-01T00:00:00Z' },
      { id: 'new', publishedAt: '2026-06-01T00:00:00Z' },
      { id: 'mid', publishedAt: '2026-03-01T00:00:00Z' },
    ]);
    expect(result.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
  });

  it('reads alternate timestamp fields', () => {
    const result = sortNewsItemsByNewest([
      { id: 'a', pubDate: '2026-01-01' },
      { id: 'b', created_at: '2026-05-01' },
    ]);
    expect(result[0].id).toBe('b');
  });

  it('treats bad or absent dates as oldest', () => {
    const result = sortNewsItemsByNewest([
      { id: 'garbage', publishedAt: 'not-a-date' },
      { id: 'none' },
      { id: 'real', publishedAt: '2026-01-01' },
    ]);
    expect(result[0].id).toBe('real');
  });

  it('does not mutate the input array', () => {
    const input = [
      { id: 'a', publishedAt: '2026-01-01' },
      { id: 'b', publishedAt: '2026-02-01' },
    ];
    const copy = [...input];
    sortNewsItemsByNewest(input);
    expect(input).toEqual(copy);
  });

  it('handles empty and default input', () => {
    expect(sortNewsItemsByNewest()).toEqual([]);
  });
});
