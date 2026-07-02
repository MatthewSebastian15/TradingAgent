import { describe, expect, it } from 'vitest';

import { dedupeNewsItems } from './dedupeNewsItems';

describe('dedupeNewsItems', () => {
  it('drops duplicates by id and keeps the first occurrence', () => {
    const first = { id: 'a', title: 'first' };
    const result = dedupeNewsItems([first, { id: 'A ', title: 'second' }, { id: 'b' }]);
    expect(result).toEqual([first, { id: 'b' }]);
  });

  it('drops duplicates by url when id is missing', () => {
    const result = dedupeNewsItems([
      { url: 'https://x.com/1' },
      { link: 'https://x.com/1' },
      { url: 'https://x.com/2' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('drops duplicates by normalized title + source', () => {
    const result = dedupeNewsItems([
      { title: 'Big  News', source: 'Reuters' },
      { headline: 'big news', publisher: 'reuters' },
      { title: 'Big News', source: 'AP' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('keeps keyless items and preserves order', () => {
    const items = [{}, { title: 'a' }, {}];
    expect(dedupeNewsItems(items)).toEqual(items);
  });

  it('returns empty array for non-array input', () => {
    expect(dedupeNewsItems(null)).toEqual([]);
    expect(dedupeNewsItems()).toEqual([]);
  });
});
