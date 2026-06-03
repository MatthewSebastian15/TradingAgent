import PropTypes from 'prop-types';

import { safeExternalUrl } from '../../../utils/url';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';

function formatDate(value) {
  if (!value) return 'N/A';
  const text = String(value);
  if (/^\d{8}T\d{6}/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }
  return text;
}

function displayLabel(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  return String(value).replace(/_/g, ' ').toUpperCase();
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

function NewsCard({ item, index }) {
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
          {item.source || item.publisher || 'vendor'}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] text-bloomberg-muted">
        <span>Publisher: {item.publisher || 'Unknown'}</span>
        <span>Published: {formatDate(item.published_at)}</span>
        <span>Event: {item.event_type || item.materiality_category || 'general'}</span>
        {item.impact && <span>Impact: {displayLabel(item.impact)}</span>}
        {item.sentiment && <span>Sentiment: {displayLabel(item.sentiment)}</span>}
        {item.impact_score !== undefined && <span>Score: {item.impact_score}</span>}
      </div>

      {item.summary && (
        <p className="mt-3 font-mono text-xs text-bloomberg-muted leading-relaxed">
          {item.summary}
        </p>
      )}

      {item.relevance_reason && (
        <p className="mt-2 font-mono text-xs text-bloomberg-muted leading-relaxed">
          <span className="text-bloomberg-white">Why it matters:</span> {item.relevance_reason}
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
  const impactFullNewsItems = Array.isArray(newsImpact.full_news_list)
    ? newsImpact.full_news_list
    : [];
  const fullNewsItems = impactFullNewsItems.length > 0 ? impactFullNewsItems : relatedItems;
  const highImpactItems = Array.isArray(newsImpact.high_impact_news)
    ? newsImpact.high_impact_news
    : [];

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
        <SectionHeader label="NEWS" />
        <div className="font-mono text-xs text-bloomberg-muted leading-relaxed">
          {relatedNews.summary || `Top related news for ${result.ticker || 'this ticker'}.`}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-[11px] text-bloomberg-muted">
          <SummaryMetric label="SOURCE" value={relatedNews.source || 'N/A'} />
          <SummaryMetric label="LOOKBACK" value={`${relatedNews.lookback_days || 'N/A'} days`} />
          <SummaryMetric label="ITEMS" value={fullNewsItems.length} />
          <SummaryMetric label="SENTIMENT" value={displayLabel(newsImpact.overall_sentiment)} />
          <SummaryMetric label="SENTIMENT SCORE" value={newsImpact.sentiment_score ?? 'N/A'} />
          <SummaryMetric label="DEDUPED" value={newsImpact.deduplicated_count ?? 'N/A'} />
        </div>
      </section>

      {highImpactItems.length > 0 && (
        <section>
          <SectionHeader label="HIGH-IMPACT NEWS" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {highImpactItems.slice(0, 4).map((item, index) => (
              <NewsCard
                key={item.normalized_url || item.url || `${item.title}-${index}`}
                item={item}
                index={index}
              />
            ))}
          </div>
        </section>
      )}

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
            <SummaryMetric label="CONSENSUS" value={displayLabel(analystConsensus.consensus_label)} />
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

      {fullNewsItems.length > 0 && (
        <section>
          <SectionHeader label="FULL NEWS LIST" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {fullNewsItems.slice(0, 8).map((item, index) => (
              <NewsCard
                key={item.normalized_url || item.url || `${item.title}-${index}`}
                item={item}
                index={index}
              />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

NewsTab.propTypes = {
  result: PropTypes.object.isRequired,
};
