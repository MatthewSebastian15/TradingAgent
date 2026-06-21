import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useGeneralNews', () => ({
  loadGeneralNews: vi.fn(() => Promise.resolve(null)),
}));

import { loadGeneralNews } from '@/hooks/useGeneralNews';
import { prefetchCategory } from './categoryPrefetch';

describe('prefetchCategory', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls loadGeneralNews with the category and default params', () => {
    prefetchCategory('crypto');
    expect(loadGeneralNews).toHaveBeenCalledWith({
      category: 'crypto',
      windowDays: 7,
      limit: 100,
    });
  });

  it('passes custom windowDays and limit when provided', () => {
    prefetchCategory('markets', { windowDays: 3, limit: 50 });
    expect(loadGeneralNews).toHaveBeenCalledWith({
      category: 'markets',
      windowDays: 3,
      limit: 50,
    });
  });

  it('silently catches loadGeneralNews rejections', async () => {
    loadGeneralNews.mockRejectedValueOnce(new Error('network error'));
    expect(() => prefetchCategory('macro')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
