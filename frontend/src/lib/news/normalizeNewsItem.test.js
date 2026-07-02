import { describe, expect, it } from 'vitest';

import { normalizeNewsItem } from './normalizeNewsItem';

describe('normalizeNewsItem', () => {
  it('maps a full vendor item to the normalized shape', () => {
    const item = normalizeNewsItem({
      id: 'n1',
      source: 'Reuters',
      category: 'markets',
      publishedAt: '2026-01-02T03:04:05Z',
      headline: 'Stocks up',
      description: 'Detail',
      url: 'https://example.com/a',
    });

    expect(item).toEqual({
      id: 'n1',
      source: 'Reuters',
      category: 'MARKETS',
      publishedAt: '2026-01-02T03:04:05Z',
      headline: 'Stocks up',
      description: 'Detail',
      url: 'https://example.com/a',
    });
  });

  it('falls back through alternate field names', () => {
    const item = normalizeNewsItem({
      link: 'https://example.com/b',
      title: 'Alt title',
      summary: 'Alt summary',
      publisher: 'AP',
      topic: 'tech',
      published_at: '2026-01-01',
    });

    expect(item.id).toBe('https://example.com/b');
    expect(item.url).toBe('https://example.com/b');
    expect(item.headline).toBe('Alt title');
    expect(item.description).toBe('Alt summary');
    expect(item.source).toBe('AP');
    expect(item.category).toBe('TECH');
    expect(item.publishedAt).toBe('2026-01-01');
  });

  it('unwraps object sources by name', () => {
    expect(normalizeNewsItem({ source: { name: 'Bloomberg' } }).source).toBe('Bloomberg');
    expect(normalizeNewsItem({ source: {} }).source).toBe('Unknown Source');
  });

  it('defaults every missing field safely', () => {
    const item = normalizeNewsItem({});
    expect(item.source).toBe('Unknown Source');
    expect(item.category).toBe('GENERAL');
    expect(item.publishedAt).toBeNull();
    expect(item.headline).toBe('Untitled news');
    expect(item.description).toBe('No description available.');
    expect(item.url).toBeNull();
  });

  it('handles being called with no argument', () => {
    expect(normalizeNewsItem().headline).toBe('Untitled news');
  });
});
