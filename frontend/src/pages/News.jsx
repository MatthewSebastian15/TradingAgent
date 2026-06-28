import React, { useMemo, useState } from 'react';

import CategoryTransition from '@/components/news/CategoryTransition';
import { Card, CardContent } from '@/components/ui/card';
import { dedupeNewsItems } from '@/lib/news/dedupeNewsItems';

import NewsFilterBar from '../components/news/NewsFilterBar';
import NewsList from '../components/news/NewsList';
import NewsListSkeleton from '../components/news/NewsListSkeleton';
import { useGeneralNews } from '../hooks/useGeneralNews';
import { useGeneralNewsStream } from '../hooks/useGeneralNewsStream';

const FAILURE_PROVIDER_STATUSES = new Set([
  'error',
  'failed',
  'failure',
  'timeout',
  'rate_limited',
  'unavailable',
  'missing_api_key',
  'disabled',
]);

function providerStatusSummary(providerStatus) {
  const entries = Object.entries(providerStatus || {});
  if (!entries.length) return '';

  const failedCount = entries.filter(([, status]) =>
    FAILURE_PROVIDER_STATUSES.has(String(status || '').toLowerCase())
  ).length;

  if (!failedCount) return 'Providers OK';
  if (failedCount === entries.length) return 'Providers unavailable';
  return `${failedCount} providers unavailable`;
}

function emptyMessageFor({ category, data, error }) {
  const providerSummary = providerStatusSummary(data?.provider_status);
  const errorText = String(error?.message || '').toLowerCase();

  if (data?.message) return data.message;

  if (Number(error?.status) === 429 || errorText.includes('rate limit')) {
    return 'News refresh is cooling down after rate limit. Showing cached data.';
  }

  if (providerSummary === 'Providers unavailable') {
    return 'News providers are unavailable. Showing cached data if available.';
  }

  if (category !== 'all') return 'No news found for this category.';
  return 'No news available yet.';
}

export default function News() {
  const [category, setCategory] = useState('all');
  // Stage the fetch: a small first batch paints instantly, the full 14-day set swaps in behind it.
  const fast = useGeneralNews({ category, windowDays: 14, limit: 100 });
  const full = useGeneralNews({ category, windowDays: 14, limit: 2000 });
  const { data, status, error, reload } = full.data ? full : fast;

  useGeneralNewsStream({
    enabled: true,
    onUpdate: () => reload({ force: false, silent: true }),
  });

  const displayedArticles = useMemo(() => dedupeNewsItems(data?.articles || []), [data]);
  const showSkeleton =
    (status === 'loading' || status === 'refreshing') && !displayedArticles.length;
  const showStaleWarning = status === 'stale' && displayedArticles.length > 0;
  const showRefreshCooldown = data?.refresh?.reason === 'manual_refresh_cooldown';
  const emptyMessage = emptyMessageFor({ category, data, error });

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-12 text-bloomberg-white">
      <main className="terminal-news px-3 py-3 font-mono">
        <Card className="terminal-news-panel overflow-hidden rounded-lg border-bloomberg-border bg-black/30 text-bloomberg-white shadow-lg shadow-black/20">
          <CardContent className="p-3">
            <NewsFilterBar
              selectedCategory={category}
              onChange={setCategory}
              onRefresh={() => reload()}
            />

            <CategoryTransition key={category} categoryKey={category}>
              {showSkeleton ? (
                <NewsListSkeleton count={5} />
              ) : (
                <>
                  {showStaleWarning && (
                    <div className="terminal-news-state mt-2 rounded-md border border-bloomberg-amber/40 bg-bloomberg-amber/10 px-3 py-2 text-xs text-bloomberg-amber">
                      Showing cached news because the latest refresh failed.
                    </div>
                  )}

                  {showRefreshCooldown && (
                    <div className="terminal-news-state mt-2 rounded-md border border-bloomberg-amber/40 bg-bloomberg-amber/10 px-3 py-2 text-xs text-bloomberg-amber">
                      Refresh is cooling down. Showing latest cached news.
                    </div>
                  )}

                  {error && !displayedArticles.length && (
                    <div className="terminal-news-state mt-2 rounded-md border border-bloomberg-red/40 bg-bloomberg-red/10 px-3 py-2 text-xs text-bloomberg-red">
                      Failed to load general news.
                    </div>
                  )}

                  <NewsList articles={displayedArticles} emptyMessage={emptyMessage} />
                </>
              )}
            </CategoryTransition>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
