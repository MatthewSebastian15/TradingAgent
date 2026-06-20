import PropTypes from 'prop-types';
import { useState } from 'react';

import TickerNewsList from '@/components/news/TickerNewsList';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

const VENDOR_PUBLISHERS = new Set([
  'yfinance',
  'marketaux',
  'newsdata',
  'googlenewslight',
  'rsscontext',
]);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SORT_OPTIONS = ['Date', 'Impact', 'Sentiment'];
const IMPACT_SORT_RANK = {
  critical: 3,
  very_high: 3,
  high: 3,
  medium: 2,
  moderate: 2,
  low: 1,
};
const SENTIMENT_SORT_RANK = {
  positive: 3,
  neutral: 2,
  negative: 1,
};

function sourceKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function readableText(value) {
  const text = String(value || '').trim();
  return text || '';
}

function normalizedValue(value) {
  return readableText(value).toLowerCase().replace(/\s+/g, '_');
}

function parseNewsDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  let match = text.match(/^(\d{8})T(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const date = match[1];
    return new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8)),
      Number(match[2]),
      Number(match[3]),
      Number(match[4])
    );
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeNewsAge(date) {
  if (!date) return '-';

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffHours = Math.floor(diffMs / HOUR_MS);

  if (diffHours < 1) return '<1h';
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffMs / DAY_MS);
  return `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
}

function formatNewsDateFromDate(date) {
  return formatRelativeNewsAge(date);
}

function formatAge(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text || text === 'n/a') return '-';
  if (text === 'today') return '<1h';

  let match = text.match(/(\d+)\s*(second|seconds|sec|secs|s)\b/);
  if (match) return '<1h';

  match = text.match(/(\d+)\s*(minute|minutes|min|mins|m)\b/);
  if (match) return '<1h';

  match = text.match(/(\d+)\s*(hour|hours|hr|hrs|h)\b/);
  if (match) {
    const hours = Number(match[1]);
    if (!Number.isFinite(hours)) return '-';
    if (hours < 1) return '<1h';
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }

  match = text.match(/(\d+)\s*(day|days|d)\b/);
  if (!match) return '-';

  const days = Number(match[1]);
  if (!Number.isFinite(days)) return '-';
  if (days <= 0) return '<1h';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function formatDate(value) {
  const date = parseNewsDate(value);
  return formatNewsDateFromDate(date);
}

function newsDateValue(item) {
  return (
    item.published_at ||
    item.publishedAt ||
    item.published_date ||
    item.pub_date ||
    item.datetime ||
    item.date ||
    item.created_at
  );
}

function publishedLabel(item) {
  const dateLabel = formatDate(newsDateValue(item));
  if (dateLabel !== '-') return dateLabel;

  return formatAge(item.published_age || item.published_age_label || item.age);
}

function displayLabel(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  return String(value).replace(/_/g, ' ').toUpperCase();
}

function publisherLabel(item) {
  const candidates = [
    item.publisher,
    item.source_name,
    item.sourceName,
    item.source_label,
    item.sourceLabel,
    item.source,
    item.provider_name,
    item.provider,
  ];

  for (const candidate of candidates) {
    const text = readableText(candidate);
    if (text && !VENDOR_PUBLISHERS.has(sourceKey(text))) return text;
  }

  return 'Unknown Source';
}

function summaryText(item) {
  return readableText(item.summary || item.description || item.impact_reason) || '-';
}

function itemUrl(item) {
  const text = readableText(item.url);
  if (!text) return '';
  try {
    const parsed = new URL(text);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname ? text : '';
  } catch {
    return '';
  }
}

function newsDedupeKey(item) {
  if (!item || typeof item !== 'object') return '';
  return String(
    item.dedupe_key || item.normalized_url || item.url || item.normalized_title || item.title || ''
  )
    .trim()
    .toLowerCase();
}

function newsFallbackKey(item) {
  if (!item || typeof item !== 'object') return '';
  return `${item.title || ''}-${item.published_at || ''}`.trim().toLowerCase();
}

function dedupeNewsItems(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    if (!item || typeof item !== 'object' || !item.title) return;
    const key = newsDedupeKey(item) || newsFallbackKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });

  return result;
}

const IMPACT_RANK = {
  critical: 5,
  very_high: 5,
  high: 4,
  medium: 3,
  moderate: 3,
  low: 2,
  minimal: 1,
  none: 0,
};

function impactRank(item) {
  const impact = String(item?.impact || item?.impact_rule || item?.risk_level || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (impact in IMPACT_RANK) return IMPACT_RANK[impact];
  return item?.is_high_impact ? IMPACT_RANK.high : 0;
}

function impactScore(item) {
  const number = Number(item?.impact_score ?? item?.score ?? item?.relevance_score);
  return Number.isFinite(number) ? number : -Infinity;
}

function publishedTimestamp(item) {
  const date = parseNewsDate(newsDateValue(item));
  return date ? date.getTime() : null;
}

function impactSortRank(item) {
  return (
    IMPACT_SORT_RANK[normalizedValue(item?.impact || item?.impact_rule || item?.risk_level)] || 0
  );
}

function sentimentSortRank(item) {
  return SENTIMENT_SORT_RANK[normalizedValue(item?.sentiment || item?.sentiment_label)] || 0;
}

function sortNewsByImpact(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const rankDiff = impactRank(right.item) - impactRank(left.item);
      if (rankDiff !== 0) return rankDiff;

      const scoreDiff = impactScore(right.item) - impactScore(left.item);
      if (scoreDiff !== 0) return scoreDiff;

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function compareByDate(left, right) {
  const leftTime = publishedTimestamp(left.item);
  const rightTime = publishedTimestamp(right.item);
  if (leftTime !== null && rightTime !== null) return rightTime - leftTime;
  if (leftTime !== null) return -1;
  if (rightTime !== null) return 1;
  return 0;
}

function compareByImpact(left, right) {
  const rankDiff = impactSortRank(right.item) - impactSortRank(left.item);
  if (rankDiff !== 0) return rankDiff;
  return impactScore(right.item) - impactScore(left.item);
}

function compareBySentiment(left, right) {
  return sentimentSortRank(right.item) - sentimentSortRank(left.item);
}

function sortNewsItems(items, sortKey) {
  const comparators = {
    Date: compareByDate,
    Impact: compareByImpact,
    Sentiment: compareBySentiment,
  };
  const compare = comparators[sortKey] || compareByDate;

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compare(left, right) || left.index - right.index)
    .map(({ item }) => item);
}

function buildUnifiedNewsItems(newsImpact, relatedItems) {
  const highImpactItemsRaw = Array.isArray(newsImpact?.high_impact_news)
    ? newsImpact.high_impact_news
    : [];
  const fullNewsItemsRaw = Array.isArray(newsImpact?.full_news_list)
    ? newsImpact.full_news_list
    : relatedItems;

  return sortNewsByImpact(dedupeNewsItems([...highImpactItemsRaw, ...fullNewsItemsRaw]));
}

function strictNewsPayload(result) {
  const candidates = [result?.news_context, result?.news];
  return candidates.find(
    (candidate) =>
      candidate &&
      typeof candidate === 'object' &&
      (Array.isArray(candidate.decision_company_news) ||
        Array.isArray(candidate.market_context_news))
  );
}

function hasStrictNewsPayload(payload) {
  if (!payload) return false;
  return (
    (Array.isArray(payload.decision_company_news) && payload.decision_company_news.length > 0) ||
    (Array.isArray(payload.market_context_news) && payload.market_context_news.length > 0) ||
    (Array.isArray(payload.debug?.strict_news_filter?.excluded_news) &&
      payload.debug.strict_news_filter.excluded_news.length > 0)
  );
}

function hasNewsPayload(result) {
  const relatedItems = result?.related_news?.items;
  const impactItems = result?.news_impact?.full_news_list;
  const highImpact = result?.news_impact?.high_impact_news;
  return (
    (Array.isArray(relatedItems) && relatedItems.length > 0) ||
    (Array.isArray(impactItems) && impactItems.length > 0) ||
    (Array.isArray(highImpact) && highImpact.length > 0) ||
    result?.analyst_consensus?.available
  );
}

function SummaryMetric({ label, value }) {
  return (
    <Badge
      variant="outline"
      className="terminal-news-insight rounded-md border-border font-mono text-xs"
    >
      {label}: {value}
    </Badge>
  );
}

SummaryMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
};

function SortButton({ label, active, onClick }) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'outline'}
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className="terminal-news-filter-tab h-8 font-mono text-xs uppercase tracking-wide"
    >
      {label}
    </Button>
  );
}

SortButton.propTypes = {
  active: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

function SortControls({ activeSort, onSortChange }) {
  return (
    <div className="terminal-news-sort-controls mb-2 flex flex-wrap items-center gap-2">
      {SORT_OPTIONS.map((option, index) => (
        <span key={option} className="flex items-center gap-2">
          <SortButton
            label={option}
            active={activeSort === option}
            onClick={() => onSortChange(option)}
          />
          {index < SORT_OPTIONS.length - 1 && (
            <span className="terminal-news-label font-mono text-xs text-bloomberg-muted">|</span>
          )}
        </span>
      ))}
    </div>
  );
}

SortControls.propTypes = {
  activeSort: PropTypes.string.isRequired,
  onSortChange: PropTypes.func.isRequired,
};

function NewsRow({ item }) {
  const title = readableText(item.title) || 'Untitled';
  const url = itemUrl(item);
  const impact = displayLabel(item.impact || item.impact_rule || item.risk_level);
  const sentiment = displayLabel(item.sentiment || item.sentiment_label);

  return (
    <Card className="terminal-news-row rounded-md border-border bg-card">
      <CardContent className="terminal-news-row-content min-w-0 space-y-2 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="terminal-news-time font-mono text-xs tracking-wide text-primary">
            {publishedLabel(item)}
          </span>
          <Badge
            variant="outline"
            className="terminal-news-source rounded-md border-border font-mono text-xs"
          >
            {publisherLabel(item)}
          </Badge>
          <Badge className="terminal-news-label rounded-md border-yellow-500/60 bg-yellow-500/15 font-mono text-xs text-yellow-300">
            {sentiment}
          </Badge>
          <Badge className="terminal-news-label rounded-md border-primary/60 bg-primary/15 font-mono text-xs text-primary">
            {impact}
          </Badge>
        </div>
        <div className="min-w-0">
          <h3 className="terminal-news-headline text-sm font-semibold leading-snug text-foreground">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="terminal-news-headline hover:text-primary"
              >
                {title}
              </a>
            ) : (
              title
            )}
          </h3>
        </div>
        <p className="terminal-news-summary text-sm leading-relaxed text-muted-foreground">
          {summaryText(item)}
        </p>
      </CardContent>
    </Card>
  );
}

NewsRow.propTypes = {
  item: PropTypes.object.isRequired,
};

function ProviderStatusRows({ rows }) {
  if (!rows.length) return null;
  return (
    <div className="terminal-news-insight mt-2 space-y-1 font-mono text-xs text-bloomberg-muted">
      {rows.map((row) => (
        <div key={row.provider}>
          {row.provider}: {displayLabel(row.status)}
        </div>
      ))}
    </div>
  );
}

ProviderStatusRows.propTypes = {
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
    })
  ).isRequired,
};

function StrictNewsSection({
  label,
  items,
  emptyText,
  providerRows = [],
  initialLimit = null,
  sortable = false,
}) {
  const [showAll, setShowAll] = useState(false);
  const [activeSort, setActiveSort] = useState('Date');
  const canLimit =
    Number.isInteger(initialLimit) && initialLimit > 0 && items.length > initialLimit;
  const sortedItems = sortable ? sortNewsItems(items, activeSort) : items;
  const visibleItems = canLimit && !showAll ? sortedItems.slice(0, initialLimit) : sortedItems;

  return (
    <Card className="terminal-news-panel rounded-md border-border bg-card">
      <CardHeader className="p-4">
        <CardTitle className="terminal-news-panel-title text-sm uppercase tracking-widest">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {items.length > 0 ? (
          <div className="space-y-3">
            {sortable && <SortControls activeSort={activeSort} onSortChange={setActiveSort} />}
            {visibleItems.map((item, index) => (
              <NewsRow key={newsDedupeKey(item) || `${item.title}-${index}`} item={item} />
            ))}
            {canLimit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAll((current) => !current)}
                className="terminal-news-filter-tab h-8 font-mono text-xs uppercase tracking-wide"
              >
                {showAll ? 'Show Less' : `Show All (${items.length})`}
              </Button>
            )}
          </div>
        ) : (
          <NoticeBox title="NO NEWS" tone="amber">
            {emptyText}
            <ProviderStatusRows rows={providerRows} />
          </NoticeBox>
        )}
      </CardContent>
    </Card>
  );
}

StrictNewsSection.propTypes = {
  emptyText: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  label: PropTypes.string.isRequired,
  initialLimit: PropTypes.number,
  providerRows: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
    })
  ),
  sortable: PropTypes.bool,
};

export default function NewsTab({ result }) {
  const [activeSort, setActiveSort] = useState('Date');
  const relatedNews = result?.related_news || {};
  const newsImpact = result?.news_impact || {};
  const analystConsensus = result?.analyst_consensus || {};
  const relatedItems = Array.isArray(relatedNews.items) ? relatedNews.items : [];
  const strictPayload = strictNewsPayload(result);
  if (hasStrictNewsPayload(strictPayload)) {
    const decisionItems = Array.isArray(strictPayload.decision_company_news)
      ? strictPayload.decision_company_news.filter((item) => !item?.market_context_only)
      : [];
    const promptItems = Array.isArray(strictPayload.prompt_articles)
      ? strictPayload.prompt_articles.filter((item) => !item?.market_context_only)
      : [];
    const contextItems = Array.isArray(strictPayload.market_context_news)
      ? strictPayload.market_context_news
      : [];
    const excludedItems = Array.isArray(strictPayload.debug?.strict_news_filter?.excluded_news)
      ? strictPayload.debug.strict_news_filter.excluded_news
          .filter((item) => item?.title)
          .map((item) => ({
            ...item,
            summary: item.reason,
            source: item.provider,
            impact: 'debug',
            sentiment: 'unavailable',
          }))
      : [];

    return (
      <div className="terminal-news space-y-4 border-b border-border p-4">
        <TickerNewsList
          decisionCompanyNews={decisionItems}
          promptArticles={promptItems}
          marketContextNews={contextItems}
          providerStatus={strictPayload.provider_status || {}}
          strictNewsFilter={strictPayload.strict_news_filter || {}}
          debug={Boolean(strictPayload.debug)}
        />
        {excludedItems.length > 0 && (
          <StrictNewsSection
            label="Excluded News Debug"
            items={excludedItems}
            emptyText="No excluded news debug rows were returned."
          />
        )}
        {analystConsensus.available && (
          <section>
            <SectionHeader label="ANALYST RECOMMENDATION TREND" />
            <div className="terminal-news-insight grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-3 lg:grid-cols-6">
              <SummaryMetric label="PERIOD" value={analystConsensus.period || 'N/A'} />
              <SummaryMetric label="STRONG BUY" value={analystConsensus.strong_buy ?? 0} />
              <SummaryMetric label="BUY" value={analystConsensus.buy ?? 0} />
              <SummaryMetric label="HOLD" value={analystConsensus.hold ?? 0} />
              <SummaryMetric label="SELL" value={analystConsensus.sell ?? 0} />
              <SummaryMetric label="STRONG SELL" value={analystConsensus.strong_sell ?? 0} />
              <SummaryMetric label="TOTAL" value={analystConsensus.total ?? 0} />
              <SummaryMetric
                label="CONSENSUS"
                value={displayLabel(analystConsensus.consensus_label)}
              />
              <SummaryMetric label="TREND" value={displayLabel(analystConsensus.trend)} />
            </div>
          </section>
        )}
      </div>
    );
  }

  const newsItems = buildUnifiedNewsItems(newsImpact, relatedItems);
  const sortedNewsItems = sortNewsItems(newsItems, activeSort);
  if (!hasNewsPayload(result)) {
    return (
      <div className="terminal-news border-b border-border p-4">
        <Card className="terminal-news-panel rounded-md border-border bg-card">
          <CardContent className="p-4">
            <NoticeBox title="NEWS UNAVAILABLE" tone="amber">
              {relatedNews.warning || 'No usable related news was returned for this analysis.'}
            </NoticeBox>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="terminal-news space-y-4 border-b border-border p-4">
      <Card className="terminal-news-panel rounded-md border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="terminal-news-panel-title text-sm uppercase tracking-widest">
            NEWS
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {newsItems.length > 0 ? (
            <div className="space-y-3">
              <SortControls activeSort={activeSort} onSortChange={setActiveSort} />
              {sortedNewsItems.map((item, index) => (
                <NewsRow key={newsDedupeKey(item) || `${item.title}-${index}`} item={item} />
              ))}
            </div>
          ) : (
            <NoticeBox title="NO NEWS" tone="amber">
              No usable related news was returned for this analysis.
            </NoticeBox>
          )}
        </CardContent>
      </Card>
      {analystConsensus.available && (
        <Card className="terminal-news-panel rounded-md border-border bg-card">
          <CardHeader className="p-4">
            <CardTitle className="terminal-news-panel-title text-sm uppercase tracking-widest">
              ANALYST RECOMMENDATION TREND
            </CardTitle>
          </CardHeader>
          <CardContent className="terminal-news-insight grid grid-cols-2 gap-2 p-4 pt-0 font-mono text-xs sm:grid-cols-3 lg:grid-cols-6">
            <SummaryMetric label="PERIOD" value={analystConsensus.period || 'N/A'} />
            <SummaryMetric label="STRONG BUY" value={analystConsensus.strong_buy ?? 0} />
            <SummaryMetric label="BUY" value={analystConsensus.buy ?? 0} />
            <SummaryMetric label="HOLD" value={analystConsensus.hold ?? 0} />
            <SummaryMetric label="SELL" value={analystConsensus.sell ?? 0} />
            <SummaryMetric label="STRONG SELL" value={analystConsensus.strong_sell ?? 0} />
            <SummaryMetric label="TOTAL" value={analystConsensus.total ?? 0} />
            <SummaryMetric
              label="CONSENSUS"
              value={displayLabel(analystConsensus.consensus_label)}
            />
            <SummaryMetric label="TREND" value={displayLabel(analystConsensus.trend)} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

NewsTab.propTypes = {
  result: PropTypes.object.isRequired,
};
