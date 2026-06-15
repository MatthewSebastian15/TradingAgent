import PropTypes from 'prop-types';

import { Card } from '@/components/ui/card';

import NewsRow from './NewsRow';

export default function NewsList({ articles }) {
  if (!articles.length) {
    return (
      <Card className="mt-4 rounded-lg border-bloomberg-border bg-black/50 px-4 py-3 text-xs text-bloomberg-muted">
        No news found for this category.
      </Card>
    );
  }

  return (
    <div className="mt-4 grid gap-2">
      {articles.map((article) => (
        <NewsRow key={article.id || article.url || article.title} article={article} />
      ))}
    </div>
  );
}

NewsList.propTypes = {
  articles: PropTypes.arrayOf(PropTypes.object).isRequired,
};
