import React, { useEffect, useMemo, useRef, useState } from 'react';

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

function providerDegradation(providerStatus) {
  const entries = Object.entries(providerStatus || {});
  if (!entries.length) return { show: false, label: '', tone: 'amber' };

  const failedCount = entries.filter(([, status]) =>
    FAILURE_PROVIDER_STATUSES.has(String(status || '').toLowerCase())
  ).length;

  if (!failedCount) return { show: false, label: '', tone: 'amber' };
  if (failedCount === entries.length) {
    return { show: true, label: 'All sources unavailable', tone: 'red' };
  }
  return {
    show: true,
    label: `${failedCount}/${entries.length} sources unavailable`,
    tone: 'amber',
  };
}

function emptyMessageFor({ category, data, error }) {
  const degradation = providerDegradation(data?.provider_status);
  const errorText = String(error?.message || '').toLowerCase();

  if (data?.message) return data.message;

  if (Number(error?.status) === 429 || errorText.includes('rate limit')) {
    return 'News refresh is cooling down after rate limit. Showing cached data.';
  }

  if (degradation.tone === 'red') {
    return 'News providers are unavailable. Showing cached data if available.';
  }

  if (category !== 'all') return 'No news found for this category.';
  return 'No news available yet.';
}

function primaryStatusBanner({ error, data, status, hasArticles }) {
  if (error && !hasArticles) {
    return { tone: 'red', message: 'Failed to load general news.' };
  }
  if (data?.worker_health?.degraded) {
    return {
      tone: 'amber',
      message: `Background news refresh has failed ${data.worker_health.consecutive_failures} times in a row. Showing the last successful data.`,
    };
  }
  if (status === 'stale' && hasArticles) {
    return { tone: 'amber', message: 'Showing cached news because the latest refresh failed.' };
  }
  if (data?.refresh?.reason === 'manual_refresh_cooldown') {
    return { tone: 'amber', message: 'Refresh is cooling down. Showing latest cached news.' };
  }
  return null;
}

export default function News() {
  const [category, setCategory] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data, status, error, reload, loadMore, hasMore } = useGeneralNews({
    category,
    windowDays: 14,
    limit: 50,
  });

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await reload();
    } finally {
      setIsRefreshing(false);
    }
  };

  useGeneralNewsStream({
    enabled: true,
    onUpdate: () => reload({ force: false, silent: true }),
  });

  const [justUpdated, setJustUpdated] = useState(false);
  const lastSeenUpdateRef = useRef(undefined);

  useEffect(() => {
    const currentUpdate = data?.last_updated;
    if (!currentUpdate) return;
    const isFirstObservation = lastSeenUpdateRef.current === undefined;
    const changed = currentUpdate !== lastSeenUpdateRef.current;
    lastSeenUpdateRef.current = currentUpdate;
    if (isFirstObservation || !changed) return;

    setJustUpdated(true);
    const timeoutId = window.setTimeout(() => setJustUpdated(false), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [data?.last_updated]);

  const displayedArticles = useMemo(() => dedupeNewsItems(data?.articles || []), [data]);
  const showSkeleton =
    (status === 'loading' || status === 'refreshing') && !displayedArticles.length;
  const showRefreshCooldown = data?.refresh?.reason === 'manual_refresh_cooldown';
  const statusBanner = primaryStatusBanner({
    error,
    data,
    status,
    hasArticles: displayedArticles.length > 0,
  });
  const emptyMessage = emptyMessageFor({ category, data, error });
  const degradation = providerDegradation(data?.provider_status);

  return (
    <div className="min-h-screen bg-bloomberg-bg pt-[60px] pl-10 text-bloomberg-white">
      <main className="terminal-news px-3 py-3">
        <Card className="terminal-news-panel overflow-hidden rounded-lg border-white/[0.08] bg-[#050505] text-bloomberg-white shadow-lg shadow-black/20">
          <CardContent className="p-3">
            {status === 'refreshing' && displayedArticles.length > 0 && (
              <div
                data-testid="news-refresh-bar"
                aria-hidden
                className="mb-2 h-0.5 w-full overflow-hidden rounded-full bg-bloomberg-border/40"
              >
                <div className="h-full w-1/3 animate-pulse rounded-full bg-bloomberg-orange" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {justUpdated && (
                <span
                  data-testid="news-live-pulse"
                  className="flex shrink-0 items-center gap-1"
                  aria-live="polite"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-bloomberg-green animate-pulse-dot" />
                  <span className="font-mono text-[10px] leading-none text-bloomberg-green">
                    UPDATED
                  </span>
                </span>
              )}
              {degradation.show && (
                <span
                  className={`shrink-0 font-mono text-[10px] leading-none ${
                    degradation.tone === 'red' ? 'text-bloomberg-red' : 'text-bloomberg-amber'
                  }`}
                >
                  {degradation.label}
                </span>
              )}
              <div className="min-w-[10rem] flex-1">
                <NewsFilterBar
                  selectedCategory={category}
                  onChange={setCategory}
                  onRefresh={handleRefresh}
                  isRefreshing={isRefreshing}
                  refreshDisabled={showRefreshCooldown}
                />
              </div>
            </div>

            <CategoryTransition key={category} categoryKey={category}>
              {showSkeleton ? (
                <NewsListSkeleton count={5} />
              ) : (
                <>
                  {statusBanner && (
                    <div
                      className={`terminal-news-state mt-2 rounded-md border px-3 py-2 text-xs ${
                        statusBanner.tone === 'red'
                          ? 'border-bloomberg-red/40 bg-bloomberg-red/10 text-bloomberg-red'
                          : 'border-bloomberg-amber/40 bg-bloomberg-amber/10 text-bloomberg-amber'
                      }`}
                    >
                      {statusBanner.message}
                    </div>
                  )}

                  <NewsList
                    articles={displayedArticles}
                    emptyMessage={emptyMessage}
                    hasMore={hasMore}
                    onLoadMore={loadMore}
                  />
                </>
              )}
            </CategoryTransition>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
