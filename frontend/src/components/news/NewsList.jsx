import PropTypes from 'prop-types';

import { Card } from '@/components/ui/card';
import { sortNewsItemsByNewest } from '@/lib/news/sortNewsItemsByNewest';

import NewsRow from './NewsRow';

export default function NewsList({ articles, emptyMessage = 'No news found for this category.' }) {
  const sortedArticles = sortNewsItemsByNewest(articles);

  if (!sortedArticles.length) {
    return (
      <Card className="terminal-news-state mt-2 rounded-md border-bloomberg-border bg-black/50 px-3 py-2 text-xs text-bloomberg-muted">
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
    </div>
  );
}

NewsList.propTypes = {
  articles: PropTypes.arrayOf(PropTypes.object).isRequired,
  emptyMessage: PropTypes.string,
};
