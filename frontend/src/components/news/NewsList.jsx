import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '@/components/ui/card';
import { sortNewsItemsByNewest } from '@/lib/news/sortNewsItemsByNewest';

import NewsRow from './NewsRow';

const PAGE_SIZE = 50;

export default function NewsList({ articles, emptyMessage = 'No news found for this category.' }) {
  const sortedArticles = useMemo(() => sortNewsItemsByNewest(articles), [articles]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef(null);

  // Reset the window whenever the dataset changes (category switch, refresh).
  useEffect(() => setVisible(PAGE_SIZE), [sortedArticles]);

  // ponytail: IntersectionObserver reveal beats pulling in a virtualization lib for a flat list.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visible >= sortedArticles.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisible((count) => count + PAGE_SIZE);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible, sortedArticles.length]);

  if (!sortedArticles.length) {
    return (
      <Card className="terminal-news-state mt-2 rounded-lg border-white/[0.08] bg-[#050505] px-3.5 py-2.5 text-[11px] leading-[1.35] text-[#8a8f98]">
        {emptyMessage}
      </Card>
    );
  }

  return (
    <div className="terminal-news-list mt-2 overflow-hidden rounded-md border border-bloomberg-border/80 bg-black/40">
      {sortedArticles.slice(0, visible).map((article, index) => (
        <NewsRow
          key={article?.id || article?.url || article?.title || `general-news-${index}`}
          article={article || {}}
        />
      ))}
      {visible < sortedArticles.length && <div ref={sentinelRef} aria-hidden className="h-px" />}
    </div>
  );
}

NewsList.propTypes = {
  articles: PropTypes.arrayOf(PropTypes.object).isRequired,
  emptyMessage: PropTypes.string,
};
