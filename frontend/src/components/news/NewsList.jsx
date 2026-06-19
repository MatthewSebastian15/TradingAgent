import PropTypes from 'prop-types';

import { Card } from '@/components/ui/card';

import NewsRow from './NewsRow';

function parseArticleTime(article) {
  const value = article?.published_at || article?.publishedAt || article?.date;
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortArticlesByNewest(articles) {
  return [...articles].sort((left, right) => parseArticleTime(right) - parseArticleTime(left));
}

export default function NewsList({ articles }) {
  const sortedArticles = sortArticlesByNewest(articles);

  if (!sortedArticles.length) {
    return (
      <Card className="terminal-news-state mt-2 rounded-md border-bloomberg-border bg-black/50 px-3 py-2 text-xs text-bloomberg-muted">
        No news found for this category.
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
};
