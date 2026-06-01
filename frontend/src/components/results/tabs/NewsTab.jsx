import PropTypes from 'prop-types';

import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function formatPublishedAt(value) {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function badgeClasses(value) {
  if (value === 'positive' || value === 'success')
    return 'border-bloomberg-green text-bloomberg-green bg-bloomberg-green-dim';
  if (value === 'negative' || value === 'rate_limited' || value === 'invalid_api_key')
    return 'border-bloomberg-red text-bloomberg-red bg-bloomberg-red-dim';
  return 'border-bloomberg-border text-bloomberg-muted bg-bloomberg-surface';
}

function Badge({ children, value }) {
  return (
    <span className={`font-mono text-[10px] px-2 py-1 border uppercase ${badgeClasses(value)}`}>
      {children}
    </span>
  );
}

Badge.propTypes = {
  children: PropTypes.node.isRequired,
  value: PropTypes.string,
};

export default function NewsTab({ news }) {
  const articles = Array.isArray(news?.articles) ? news.articles : [];
  const providerStatus = news?.provider_status || {};

  return (
    <div className="px-4 py-4">
      <SectionHeader label="MARKET NEWS CONTEXT" />

      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(providerStatus).map(([provider, status]) => (
          <Badge key={provider} value={status}>
            {provider}: {status}
          </Badge>
        ))}
      </div>

      {articles.length === 0 ? (
        <NoticeBox title="NEWS UNAVAILABLE">
          {news?.empty_reason || 'No relevant company-specific news was found.'}
        </NoticeBox>
      ) : (
        <div className="flex flex-col gap-3">
          {articles.map((article, index) => (
            <article
              key={article.provider_article_id || article.url || `${article.title}-${index}`}
              className="border border-bloomberg-border bg-black bg-opacity-20 p-3"
            >
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge value={article.provider}>{article.provider}</Badge>
                <Badge value={article.sentiment_label}>
                  {article.sentiment_label || 'sentiment unavailable'}
                </Badge>
                <Badge value="relevance">relevance: {article.relevance_score ?? 0}</Badge>
              </div>
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-bloomberg-white hover:text-bloomberg-orange transition-colors"
              >
                {article.title}
              </a>
              <div className="mt-1 font-mono text-[11px] text-bloomberg-muted">
                {article.source || 'Unknown source'} | {formatPublishedAt(article.published_at)}
              </div>
              {article.summary && (
                <p className="mt-2 font-mono text-xs text-bloomberg-muted leading-relaxed">
                  {article.summary}
                </p>
              )}
              {Array.isArray(article.entities) && article.entities.length > 0 && (
                <div className="mt-2 font-mono text-[11px] text-bloomberg-muted">
                  Related:{' '}
                  {article.entities
                    .map((entity) => entity.symbol || entity.name)
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

NewsTab.propTypes = {
  news: PropTypes.object,
};
