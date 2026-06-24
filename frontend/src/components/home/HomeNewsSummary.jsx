import { ChevronDown, ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useMemo, useState } from 'react';

import { dedupeNewsItems } from '@/lib/news/dedupeNewsItems';
import { formatNewsTime } from '@/lib/news/formatNewsTime';
import { normalizeNewsItem } from '@/lib/news/normalizeNewsItem';
import { sortNewsItemsByNewest } from '@/lib/news/sortNewsItemsByNewest';

function HomeNewsSummarySkeleton() {
  return (
    <div aria-label="Loading summary news" role="status" className="divide-y divide-border">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="py-1.5 first:pt-0 last:pb-0">
          <div className="mb-1 h-2.5 w-32 animate-pulse rounded bg-muted" />
          <div className="mb-1 h-3.5 w-full animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function HomeNewsSummary({ news = [], loading = false, error = '' }) {
  const [collapsed, setCollapsed] = useState(false);
  const topNews = useMemo(() => {
    const normalizedNews = (Array.isArray(news) ? news : []).map((item) =>
      normalizeNewsItem(item || {})
    );

    return sortNewsItemsByNewest(dedupeNewsItems(normalizedNews)).slice(0, 3);
  }, [news]);

  return (
    <section
      aria-labelledby="home-news-summary-title"
      className="max-h-[240px] overflow-hidden rounded-lg border border-border bg-card/80 p-2 font-mono text-card-foreground shadow-sm sm:max-h-[230px] sm:p-2.5 lg:max-h-[220px]"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className={`flex w-full items-center justify-between gap-2 ${collapsed ? '' : 'mb-1.5'}`}
      >
        <h2
          id="home-news-summary-title"
          className="flex items-center gap-1 text-sm font-semibold leading-none"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          News
        </h2>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Top 3 Latest
        </span>
      </button>

      {collapsed ? null : loading ? (
        <HomeNewsSummarySkeleton />
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
        >
          Unable to load summary news.
        </div>
      ) : topNews.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          No news available yet.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {topNews.map((item, index) => {
            const content = (
              <>
                <div className="mb-0.5 truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                  {item.category} - {item.source} - {formatNewsTime(item.publishedAt)}
                </div>

                <h3 className="line-clamp-1 text-[13px] font-semibold leading-snug group-hover:text-primary">
                  {item.headline}
                </h3>

                <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">
                  {item.description}
                </p>
              </>
            );
            const key = item.id || `${item.headline}-${index}`;

            return item.url ? (
              <a
                key={key}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="group block rounded-md px-1 py-1.5 transition hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring first:pt-0 last:pb-0"
              >
                {content}
              </a>
            ) : (
              <article key={key} className="group rounded-md px-1 py-1.5 first:pt-0 last:pb-0">
                {content}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

HomeNewsSummary.propTypes = {
  error: PropTypes.string,
  loading: PropTypes.bool,
  news: PropTypes.arrayOf(PropTypes.object),
};
