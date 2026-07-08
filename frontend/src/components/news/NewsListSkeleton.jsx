import PropTypes from 'prop-types';

import { Skeleton } from '@/components/ui/skeleton';

export default function NewsListSkeleton({ count = 5 }) {
  const items = Array.from({ length: count }, (_, index) => index);

  return (
    <div
      className="terminal-news-list mt-2 overflow-hidden rounded-md border border-bloomberg-border/80 bg-black/40"
      role="status"
      aria-label="Loading news"
    >
      {items.map((item) => (
        <article
          key={`news-skeleton-${item}`}
          className="terminal-news-row rounded-lg border border-white/[0.08] bg-[#050505] px-3.5 py-2.5"
        >
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-2.5 w-44 rounded-sm bg-bloomberg-border/50" />
            <Skeleton className="h-3.5 w-full max-w-3xl rounded-sm bg-bloomberg-border/60" />
            <Skeleton className="h-3 w-3/4 rounded-sm bg-bloomberg-border/45" />
          </div>
        </article>
      ))}
    </div>
  );
}

NewsListSkeleton.propTypes = {
  count: PropTypes.number,
};
