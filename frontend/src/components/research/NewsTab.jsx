import PropTypes from 'prop-types';

import TickerNewsList from '@/components/news/TickerNewsList';

import { SectionCard, SkeletonRow } from './primitives';
import { useTickerNews } from '../../hooks/useTickerNews';

// Same data source and list as the analysis result's news section, so both surfaces agree.
export default function NewsTab({ ticker }) {
  const news = useTickerNews({ ticker });
  const hasArticles =
    news.decisionCompanyNews.length > 0 ||
    news.promptArticles.length > 0 ||
    news.marketContextNews.length > 0;

  return (
    <SectionCard title="NEWS">
      {news.status === 'loading' && (
        <div data-testid="news-loading">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}
      {news.status === 'error' && !hasArticles && (
        <div className="px-4 py-6 font-mono text-xs text-bloomberg-red">
          ■ FAILED TO LOAD: {news.error?.message || 'Failed to load news.'}
        </div>
      )}
      {(news.status !== 'loading' && news.status !== 'error') || hasArticles ? (
        <div className="terminal-news space-y-4 p-4">
          <TickerNewsList
            decisionCompanyNews={news.decisionCompanyNews}
            promptArticles={news.promptArticles}
            marketContextNews={news.marketContextNews}
            providerStatus={news.providerStatus}
            strictNewsFilter={news.strictNewsFilter}
          />
        </div>
      ) : null}
    </SectionCard>
  );
}

NewsTab.propTypes = { ticker: PropTypes.string.isRequired };
