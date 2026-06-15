import PropTypes from 'prop-types';

import NewsRow from './NewsRow';

export default function NewsList({ articles }) {
  if (!articles.length) {
    return <div className="py-4 text-xs text-bloomberg-muted">No news found for this category.</div>;
  }

  return (
    <div className="divide-y divide-bloomberg-border">
      {articles.map((article) => (
        <NewsRow key={article.id || article.url || article.title} article={article} />
      ))}
    </div>
  );
}

NewsList.propTypes = {
  articles: PropTypes.arrayOf(PropTypes.object).isRequired,
};
