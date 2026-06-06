import PropTypes from 'prop-types';

import DataStatusBadge from '../../DataStatusBadge';
import { safeExternalUrl } from '../../../utils/url';
import { getFieldQuality } from '../../../utils/dataStatus';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function formatDate(value) {
  if (!value) return 'N/A';
  const text = String(value);
  if (/^\d{8}T\d{6}/.test(text)) {
    return `${text.substring(0, 4)}-${text.substring(4, 6)}-${text.substring(6, 8)}`;
  }
  return text;
}

function displayLabel(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  return String(value).replace(/_/g, ' ').toUpperCase();
}

function shortLabel(value, max = 18) {
  const text = String(value || '').trim();
  if (!text) return 'vendor';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
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

function excludeNewsItems(items, excludedItems) {
  const excludedKeys = new Set(
    dedupeNewsItems(excludedItems)
      .map((item) => newsDedupeKey(item) || newsFallbackKey(item))
      .filter(Boolean)
  );

  return dedupeNewsItems(items).filter(
    (item) => !excludedKeys.has(newsDedupeKey(item) || newsFallbackKey(item))
  );
}

function hasNewsPayload(result) {
  const relatedItems = result?.related_news?.items;
  const impactItems = result?.news_impact?.full_news_list;
  const highImpact = result?.news_impact?.high_impact_news;
  const tracker = result?.catalyst_tracker || {};
  return (
    (Array.isArray(relatedItems) && relatedItems.length > 0) ||
    (Array.isArray(impactItems) && impactItems.length > 0) ||
    (Array.isArray(highImpact) && highImpact.length > 0) ||
    (Array.isArray(tracker.positive_catalysts) && tracker.positive_catalysts.length > 0) ||
    (Array.isArray(tracker.negative_catalysts) && tracker.negative_catalysts.length > 0) ||
    (Array.isArray(tracker.upcoming_events) && tracker.upcoming_events.length > 0) ||
    result?.analyst_consensus?.available
  );
}

function SummaryMetric({ label, value }) {
  return (
    <span className="border border-bloomberg-border px-2 py-1">
      {label}: {value}
    </span>
  );
}

SummaryMetric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
};

function NewsCard({ item, index, quality }) {
  const url = safeExternalUrl(item.url);

  return (
    <article className="border border-bloomberg-border bg-black px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-bloomberg-orange tracking-wider mb-1">
            NEWS #{index + 1}
          </div>
          <h3 className="font-mono text-sm text-bloomberg-white font-semibold leading-relaxed">
            {item.title}
          </h3>
        </div>
        <span className="font-mono text-[10px] border border-bloomberg-border text-bloomberg-muted px-2 py-1 uppercase flex-shrink-0">
          {shortLabel(item.source || item.publisher || item.source_confidence_label || 'vendor')}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] text-bloomberg-muted">
        <span>Publisher: {item.publisher || 'Unknown'}</span>
        <span>Provider: {item.provider || item.source || 'Unknown'}</span>
        <span>Published: {formatDate(item.published_at)}</span>
        <span>Scope: {displayLabel(item.scope_label || item.news_scope || 'company')}</span>
        {item.source_confidence_label && (
          <span>Source Confidence: {displayLabel(item.source_confidence_label)}</span>
        )}
        {item.impact && <span>Impact: {displayLabel(item.impact)}</span>}
        {item.sentiment && <span>Sentiment: {displayLabel(item.sentiment)}</span>}
        {item.impact_status && <span>Impact Status: {displayLabel(item.impact_status)}</span>}
      </div>

      <div className="mt-2">
        <DataStatusBadge
          compact
          quality={quality}
          status={quality ? undefined : item.status || 'available'}
          source={item.source || item.publisher}
          reason={item.impact_reason || item.relevance_reason}
          confidenceScore={item.source_confidence_score}
        />
      </div>

      {item.summary && (
        <p className="mt-3 font-mono text-xs text-bloomberg-muted leading-relaxed">
          {item.summary}
        </p>
      )}

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 font-mono text-xs text-bloomberg-orange hover:text-orange-300 tracking-wider"
        >
          OPEN ORIGINAL SOURCE
        </a>
      )}
    </article>
  );
}

NewsCard.propTypes = {
  item: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  quality: PropTypes.object,
};

function CatalystList({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <section>
      <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
        {title}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {items.slice(0, 6).map((item, index) => (
          <article
            key={`${item.label || item.related_news_title || title}-${index}`}
            className="border border-bloomberg-border bg-black px-3 py-2"
          >
            <div className="font-mono text-sm text-bloomberg-white font-semibold">
              {item.label || item.related_news_title || 'Catalyst'}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 font-mono text-[11px] text-bloomberg-muted">
              <span>Type: {displayLabel(item.type)}</span>
              <span>Impact: {displayLabel(item.impact || item.risk_level)}</span>
              <span>Source: {item.source || 'N/A'}</span>
              <span>Date: {formatDate(item.date)}</span>
            </div>
            {item.related_news_title && (
              <p className="mt-2 font-mono text-xs text-bloomberg-muted leading-relaxed">
                {item.related_news_title}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

CatalystList.propTypes = {
  title: PropTypes.string.isRequired,
  items: PropTypes.array,
};

export default function NewsTab({ result }) {
  const relatedNews = result?.related_news || {};
  const newsImpact = result?.news_impact || {};
  const tracker = result?.catalyst_tracker || {};
  const analystConsensus = result?.analyst_consensus || {};
  const relatedItems = Array.isArray(relatedNews.items) ? relatedNews.items : [];
  const hasNewsImpactFullList = Array.isArray(newsImpact.full_news_list);
  const impactFullNewsItems = hasNewsImpactFullList ? newsImpact.full_news_list : [];
  const highImpactItemsRaw = Array.isArray(newsImpact.high_impact_news)
    ? newsImpact.high_impact_news
    : [];
  const fullNewsItemsRaw = hasNewsImpactFullList ? impactFullNewsItems : relatedItems;
  const highImpactItems = dedupeNewsItems(highImpactItemsRaw);
  const fullNewsItems = excludeNewsItems(fullNewsItemsRaw, highImpactItems);
  const companyNewsQuality = getFieldQuality(result?.data_quality, 'company_news');
  if (!hasNewsPayload(result)) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <NoticeBox title="NEWS UNAVAILABLE" tone="amber">
          {relatedNews.warning || 'No usable related news was returned for this analysis.'}
        </NoticeBox>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border space-y-4">
      <section>
        <SectionHeader label="HIGH-IMPACT NEWS" />
        {highImpactItems.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {highImpactItems.map((item, index) => (
              <NewsCard
                key={newsDedupeKey(item) || `${item.title}-${index}`}
                item={item}
                index={index}
                quality={companyNewsQuality}
              />
            ))}
          </div>
        ) : (
          <NoticeBox title="NO HIGH-IMPACT NEWS" tone="amber">
            No articles passed the strict high-impact filter for this analysis window.
          </NoticeBox>
        )}
      </section>

      <CatalystList title="POSITIVE CATALYSTS" items={tracker.positive_catalysts} />
      <CatalystList title="NEGATIVE CATALYSTS" items={tracker.negative_catalysts} />
      <CatalystList title="UPCOMING EVENTS" items={tracker.upcoming_events} />

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

      {tracker.summary?.main_message && (
        <section>
          <SectionHeader label="CATALYST SUMMARY" />
          <p className="font-mono text-xs text-bloomberg-muted leading-relaxed">
            {tracker.summary.main_message}
          </p>
        </section>
      )}

      <section>
        <SectionHeader label="FULL NEWS LIST" />
        <div className="font-mono text-xs text-bloomberg-muted leading-relaxed mb-2">
          Includes company, index, sector, and market-context news that did not qualify as high
          impact.
        </div>
        {fullNewsItems.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {fullNewsItems.map((item, index) => (
              <NewsCard
                key={newsDedupeKey(item) || `${item.title}-${index}`}
                item={item}
                index={index}
                quality={companyNewsQuality}
              />
            ))}
          </div>
        ) : (
          <NoticeBox title="NO ADDITIONAL NEWS" tone="amber">
            All valid articles are already classified as high impact or no additional related
            articles were available.
          </NoticeBox>
        )}
      </section>
    </div>
  );
}

NewsTab.propTypes = {
  result: PropTypes.object.isRequired,
};
