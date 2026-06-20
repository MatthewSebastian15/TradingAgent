import PropTypes from 'prop-types';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import NoticeBox from '@/components/results/NoticeBox';

import TickerNewsQualityBadge from './TickerNewsQualityBadge';

function readable(value) {
  return String(value || '').trim();
}

function articleUrl(article) {
  const value = readable(article?.url);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? value : '';
  } catch {
    return '';
  }
}

function articleKey(article, index) {
  return readable(article?.content_hash || article?.url || article?.title) || `ticker-news-${index}`;
}

function metaValue(article) {
  return [
    readable(article?.provider),
    readable(article?.source || article?.source_domain),
    readable(article?.published_at),
    article?.relevance_score !== undefined ? `Score ${Math.round(Number(article.relevance_score) || 0)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function reasonValue(article) {
  const reasons = Array.isArray(article?.relevance_reasons) ? article.relevance_reasons : [];
  const terms = Array.isArray(article?.matched_terms) ? article.matched_terms : [];
  const reason = reasons.length ? `Reason: ${reasons.join(', ')}` : '';
  const matched = terms.length ? `Matched: ${terms.join(', ')}` : '';
  return [reason, matched].filter(Boolean).join(' · ');
}

function StrictFilterSummary({ strictNewsFilter }) {
  if (!strictNewsFilter || typeof strictNewsFilter !== 'object') return null;

  const decision = strictNewsFilter.decision_company_news_count ?? 0;
  const context = strictNewsFilter.market_context_news_count ?? 0;
  const excluded = strictNewsFilter.excluded_news_count ?? 0;
  const rssThreshold = strictNewsFilter.rss_decision_min_relevance_score ?? '-';

  return (
    <div className="flex flex-wrap gap-2 font-mono text-xs text-muted-foreground">
      <Badge variant="outline" className="rounded-md border-border">{decision} used for AI</Badge>
      <Badge variant="outline" className="rounded-md border-border">{context} market context</Badge>
      <Badge variant="outline" className="rounded-md border-border">{excluded} excluded</Badge>
      <Badge variant="outline" className="rounded-md border-border">RSS threshold {rssThreshold}</Badge>
    </div>
  );
}

StrictFilterSummary.propTypes = {
  strictNewsFilter: PropTypes.object,
};

function ProviderStatus({ providerStatus }) {
  const rows = providerStatus && typeof providerStatus === 'object' ? Object.entries(providerStatus) : [];
  if (!rows.length) return null;

  return (
    <Card className="rounded-md border-border bg-card">
      <CardHeader className="p-4">
        <CardTitle className="text-sm uppercase tracking-widest">Provider Status</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
        {rows.map(([provider, status]) => (
          <TickerNewsQualityBadge key={provider} provider={provider} status={String(status)} />
        ))}
      </CardContent>
    </Card>
  );
}

ProviderStatus.propTypes = {
  providerStatus: PropTypes.object,
};

function ArticleCard({ article, debug = false }) {
  const title = readable(article?.title) || 'Untitled';
  const url = articleUrl(article);
  const summary = readable(article?.summary || article?.description);
  const reason = reasonValue(article);

  return (
    <Card className="rounded-md border-border bg-card">
      <CardContent className="space-y-2 p-3">
        <div className="font-mono text-xs text-muted-foreground">{metaValue(article)}</div>
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
              {title}
            </a>
          ) : (
            title
          )}
        </h3>
        {summary && <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>}
        {reason && <p className="font-mono text-xs text-bloomberg-muted">{reason}</p>}
        {debug && (
          <p className="font-mono text-xs text-bloomberg-muted">
            entity_match: {readable(article?.entity_match) || 'none'} · bucket: {readable(article?.bucket) || 'none'} · category:{' '}
            {readable(article?.relevance_category) || 'none'} · filter: {readable(article?.decision_filter_reason) || 'none'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

ArticleCard.propTypes = {
  article: PropTypes.object.isRequired,
  debug: PropTypes.bool,
};

function NewsSection({ title, label, items, emptyText, debug }) {
  return (
    <Card className="rounded-md border-border bg-card">
      <CardHeader className="p-4">
        <CardTitle className="text-sm uppercase tracking-widest">{title}</CardTitle>
        {label && <p className="font-mono text-xs text-muted-foreground">{label}</p>}
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {items.length ? (
          items.map((article, index) => <ArticleCard key={articleKey(article, index)} article={article} debug={debug} />)
        ) : (
          <NoticeBox title="NO NEWS" tone="amber">{emptyText}</NoticeBox>
        )}
      </CardContent>
    </Card>
  );
}

NewsSection.propTypes = {
  debug: PropTypes.bool,
  emptyText: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  label: PropTypes.string,
  title: PropTypes.string.isRequired,
};

export default function TickerNewsList({
  decisionCompanyNews = [],
  promptArticles = [],
  marketContextNews = [],
  providerStatus = {},
  strictNewsFilter = {},
  debug = false,
}) {
  const companyNews = decisionCompanyNews.length ? decisionCompanyNews : promptArticles;

  return (
    <div className="space-y-4">
      <Card className="rounded-md border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="text-sm uppercase tracking-widest">Strict Filter Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <StrictFilterSummary strictNewsFilter={strictNewsFilter} />
        </CardContent>
      </Card>

      <NewsSection
        title="Company-specific News"
        items={companyNews.filter((item) => !item?.market_context_only)}
        emptyText="No company-specific news passed the strict decision filter. Market context may still be available below, but it is not used as direct company evidence by the AI Agent."
        debug={debug}
      />

      <NewsSection
        title="Market Context"
        label="Market Context, not direct company evidence"
        items={marketContextNews}
        emptyText="No market context news was returned."
        debug={debug}
      />

      <ProviderStatus providerStatus={providerStatus} />
    </div>
  );
}

TickerNewsList.propTypes = {
  debug: PropTypes.bool,
  decisionCompanyNews: PropTypes.arrayOf(PropTypes.object),
  marketContextNews: PropTypes.arrayOf(PropTypes.object),
  promptArticles: PropTypes.arrayOf(PropTypes.object),
  providerStatus: PropTypes.object,
  strictNewsFilter: PropTypes.object,
};
