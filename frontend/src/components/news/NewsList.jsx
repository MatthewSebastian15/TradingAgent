import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef } from 'react';

import { Card } from '@/components/ui/card';
import { sortNewsItemsByNewest } from '@/lib/news/sortNewsItemsByNewest';

import NewsRow from './NewsRow';

export default function NewsList({
  articles,
  emptyMessage = 'No news found for this category.',
  hasMore = false,
  onLoadMore,
}) {
  const sortedArticles = useMemo(() => sortNewsItemsByNewest(articles), [articles]);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || !onLoadMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (!sortedArticles.length) {
    return (
      <Card className="terminal-news-state mt-2 rounded-lg border-white/[0.08] bg-[#050505] px-3.5 py-2.5 text-[11px] leading-[1.35] text-[#8a8f98]">
        {emptyMessage}
      </Card>
    );
  }

  return (
    <div className="terminal-news-list mt-2 overflow-hidden rounded-md border border-bloomberg-border/80 bg-black/40">
      {sortedArticles.map((article, index) => (
        <NewsRow
          key={article?.id || article?.url || article?.title || `general-news-${index}`}
          article={article || {}}
        />
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
    </div>
  );
}

NewsList.propTypes = {
  articles: PropTypes.arrayOf(PropTypes.object).isRequired,
  emptyMessage: PropTypes.string,
  hasMore: PropTypes.bool,
  onLoadMore: PropTypes.func,
};
