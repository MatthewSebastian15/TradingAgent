import { useState } from 'react';
import PropTypes from 'prop-types';

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

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const DAY_MS = 24 * 60 * 60 * 1000;
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
  let match = text.match(/^(\d{8})T\d{6}/);
  if (match) {
    const date = match[1];
    return new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(4, 6)) - 1,
      Number(date.slice(6, 8))
    );
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatNewsDateFromDate(date) {
  if (!date) return '-';
  const publishedDay = startOfDay(date);
  const today = startOfDay(new Date());
  const diffDays = Math.floor((today.getTime() - publishedDay.getTime()) / DAY_MS);
  if (diffDays === 0) return 'Today';
  if (diffDays > 0 && diffDays <= 7) return `${diffDays} ${diffDays === 1 ? 'Day' : 'Days'}`;
  return `${publishedDay.getDate()} ${MONTH_LABELS[publishedDay.getMonth()]}`;
}

function formatAge(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text || text === 'n/a') return '-';
  if (text === 'today' || /(hour|minute|second)s?\b/.test(text)) return 'Today';

  const match = text.match(/(\d+)\s*(day|days|d)\b/);
  if (!match) return '-';

  const days = Number(match[1]);
  if (!Number.isFinite(days)) return '-';
  if (days <= 0) return 'Today';
  if (days <= 7) return `${days} ${days === 1 ? 'Day' : 'Days'}`;

  return formatNewsDateFromDate(new Date(Date.now() - days * DAY_MS));
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

function providerStatusRows(payload) {
  const rows = [];
  const seen = new Set();
  const objectEntries = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
  const addRow = (provider, status) => {
    const providerText = readableText(provider);
    const statusText = readableText(status);
    if (!providerText || !statusText) return;
    const key = providerText.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ provider: providerText, status: statusText });
  };

  objectEntries(payload?.provider_status).forEach(([provider, status]) => {
    addRow(provider, status);
  });

  objectEntries(payload?.provider_health).forEach(([provider, health]) => {
    addRow(provider, health?.status || health?.last_error);
  });

  objectEntries(payload?.debug?.provider_attempts).forEach(([provider, attempts]) => {
    const list = Array.isArray(attempts) ? attempts : [];
    const latest = [...list].reverse().find((attempt) => attempt?.status);
    addRow(provider, latest?.status);
  });

  return rows;
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
  return impactSortRank(right.item) - impactSortRank(left.item);
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
    <Badge variant="outline" className="rounded-md border-border font-mono text-xs">
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
      className="h-8 font-mono text-xs uppercase tracking-wide"
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

function NewsRow({ item }) {
  const title = readableText(item.title) || 'Untitled';
  const url = itemUrl(item);
  const impact = displayLabel(item.impact || item.impact_rule || item.risk_level);
  const sentiment = displayLabel(item.sentiment || item.sentiment_label);

  return (
    <Card className="rounded-md border-border bg-card">
      <CardContent className="min-w-0 space-y-3 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-xs tracking-wide text-primary">{publishedLabel(item)}</span>
          <Badge variant="outline" className="rounded-md border-border font-mono text-xs">
            {publisherLabel(item)}
          </Badge>
          <Badge className="rounded-md border-yellow-500/60 bg-yellow-500/15 font-mono text-xs text-yellow-300">
            {sentiment}
          </Badge>
          <Badge className="rounded-md border-primary/60 bg-primary/15 font-mono text-xs text-primary">
            {impact}
          </Badge>
        </div>
        <div className="min-w-0">
          <h3 className="font-sans text-sm font-semibold leading-snug text-foreground">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary"
              >
                {title}
              </a>
            ) : (
              title
            )}
          </h3>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{summaryText(item)}</p>
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
    <div className="mt-2 space-y-1 font-mono text-xs text-bloomberg-muted">
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

function StrictNewsSection({ label, items, emptyText, providerRows = [] }) {
  return (
    <Card className="rounded-md border-border bg-card">
      <CardHeader className="p-4">
        <CardTitle className="text-sm uppercase tracking-widest">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <NewsRow key={newsDedupeKey(item) || `${item.title}-${index}`} item={item} />
          ))}
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
  providerRows: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
    })
  ),
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
    const contextItems = Array.isArray(strictPayload.market_context_news)
      ? strictPayload.market_context_news
      : [];
    const contextProviderRows = contextItems.length > 0 ? [] : providerStatusRows(strictPayload);
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
      <div className="space-y-4 border-b border-border p-4">
        <StrictNewsSection
          label="Company News Used for Decision"
          items={decisionItems}
          emptyText="No company-specific decision news was returned."
        />
        <StrictNewsSection
          label="Market Context News"
          items={contextItems}
          emptyText="No market context news was returned."
          providerRows={contextProviderRows}
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono text-xs">
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
      <div className="border-b border-border p-4">
        <Card className="rounded-md border-border bg-card">
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
    <div className="space-y-4 border-b border-border p-4">
      <Card className="rounded-md border-border bg-card">
        <CardHeader className="p-4">
          <CardTitle className="text-sm uppercase tracking-widest">NEWS</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
        {newsItems.length > 0 ? (
          <div className="space-y-3">
            <div className="mb-2 flex items-center gap-2">
              {SORT_OPTIONS.map((option, index) => (
                <span key={option} className="flex items-center gap-2">
                  <SortButton
                    label={option}
                    active={activeSort === option}
                    onClick={() => setActiveSort(option)}
                  />
                  {index < SORT_OPTIONS.length - 1 && (
                    <span className="font-mono text-xs text-bloomberg-muted">|</span>
                  )}
                </span>
              ))}
            </div>
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
        <Card className="rounded-md border-border bg-card">
          <CardHeader className="p-4">
            <CardTitle className="text-sm uppercase tracking-widest">
              ANALYST RECOMMENDATION TREND
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 p-4 pt-0 font-mono text-xs sm:grid-cols-3 lg:grid-cols-6">
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
